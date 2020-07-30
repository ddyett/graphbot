// eslint-disable-next-line no-unused-vars
import { AzureFunction, Context, HttpRequest } from "@azure/functions";
import * as azdev from "azure-devops-node-api";
import { createAppAuth } from "@octokit/auth-app";
import { graphql } from "@octokit/graphql";
import smeeClient = require("smee-client"); //had to do this due to esmoduleinterop being true
import { DefaultAzureCredential } from "@azure/identity";
import { SecretClient } from "@azure/keyvault-secrets";
// eslint-disable-next-line no-unused-vars
import { CommentsQL, IssueResponse, EventResponse } from "./Interfaces"
import * as data from "./data.json"

const keyVaultName = process.env["KEY_VAULT_NAME"];
const keyVaultUri = `https://${keyVaultName}.vault.azure.net`;

const credential = new DefaultAzureCredential();
const secretClient = new SecretClient(keyVaultUri, credential);

const token: string = process.env["ADOToken"];

// establish connection to azure
const authHandler = azdev.getPersonalAccessTokenHandler(token);
const connection = new azdev.WebApi(process.env["VSInstance"], authHandler);

if (process.env["IsDevelopment"]) {
    const smee = new smeeClient({
        source: process.env["webproxy_url"],
        target: 'http://localhost:7071/api/Webhook'
    });

    smee.start();
}

const createNewWorkItem = async (context: Context, body: EventResponse): Promise<number> => {

    interface AreaMapping {
        [repoName: string]: { areaPath: string };
    }

    const description = body.issue && body.issue.body;

    if (description && description.indexOf('AB#') > -1) {
        // this item is already tracked by work in azure boards so abort;
        return;
    }

    // figure out if this should be filed as a bug or an issue by looking at the labels on the issue
    const labels = body.issue && body.issue.labels;

    // we'll open bugs by default
    let workType: string = process.env["BugName"];

    for (var i = 0; i < labels.length; i++) {
        if (data.workItemLabels.indexOf(labels[i].name) > -1) {
            workType = process.env["UserStoryName"];
            break;
        }
    }

    const descriptionField: string = workType === process.env["BugName"] ? process.env["BugDescriptionField"] : process.env["UserStoryDescriptionField"];

    //grab the area for this particular repo.
    const areaPath: AreaMapping = data.repoAreaMapping[body.repository.name];

    const witApi = await connection.getWorkItemTrackingApi();
    const result = await witApi.createWorkItem({},
        [
            {
                "op": "add",
                "path": "/fields/System.Title",
                "from": null,
                "value": `${body.issue.title}`
            },
            {
                "op": "add",
                "path": "/fields/System.AreaPath",
                "from": null,
                "value": `${areaPath}`
            },
            {
                "op": "add",
                "path": "/fields/System.IterationPath",
                "from": null,
                "value": `${process.env["DefaultIteration"]}`
            },
            {
                "op": "add",
                "path": `/fields/${descriptionField}`,
                "from": null,
                "value": `${description}`
            },
        ]
        , process.env["ProjectName"], workType);

    return result.id;
}

const updateWorkDescription = async (context: Context, body: EventResponse, workItemId: number): Promise<void> => {
    try {
        const witApi = await connection.getWorkItemTrackingApi();
        const workItem = await witApi.getWorkItem(workItemId);

        const descriptionField: string = workItem.fields[process.env["BugDescriptionField"]] ? process.env["BugDescriptionField"] : process.env["UserStoryDescriptionField"];
        const azurebotIndex = body.issue.body.indexOf("[AB#");
        const description = body.issue.body.substring(0, azurebotIndex > -1 ? azurebotIndex : undefined);

        await witApi.updateWorkItem(undefined, [{
            "op": "add",
            "path": `/fields/${descriptionField}`,
            "from": null,
            "value": `${description}`
        },
        ], workItemId);
    }
    catch (err) {
        context.log(err);
    }
}

const updateAssignment = async (context: Context, body: EventResponse, workItemId: number): Promise<void> => {
    try{
        const witApi = await connection.getWorkItemTrackingApi();

        await witApi.updateWorkItem(undefined, [{
            "op": "add",
            "path": `/fields/System.AssignedTo`,
            "from": null,
            "value": `${data.assignmentMap[body.assignee.login]}`
        },
        ], workItemId);
    }
    catch (err){
        context.log(err);
    }
}

const addAllComments = async (context: Context, issueData: IssueResponse, workItemId: number): Promise<void> => {
    try {
        const commentsSection = issueData.repository.issue.comments.edges;

        if (!commentsSection || commentsSection.length === 0)
            return;

        commentsSection.forEach(async (section: CommentsQL) => {
            const comment: string = section.node && section.node.bodyText;

            // not completely sure why but there was missing data if reconnecting was not done
            const witApi = await connection.getWorkItemTrackingApi();
            witApi.addComment(
                {
                    "text": `${section.node.author.login} said: ${comment}`
                },
                process.env["ProjectName"],
                workItemId);
        });
    }
    catch (err) {
        context.log(err);
    }
}

const addNewcomment = async (context: Context, workItemId: number, body: EventResponse): Promise<void> => {
    const comment = body.comment && body.comment.body;
    const user = body.comment.user.login;

    if (!comment)
        return;

    try {
        const witApi = await connection.getWorkItemTrackingApi();
        witApi.addComment(
            {
                "text": `${user} said: ${comment}`
            },
            process.env["ProjectName"],
            workItemId);
    }
    catch (err) {
        context.log(err);
    }
}


const updateGitHubIssue = async (context: Context, body: EventResponse, workItemId: number, updateComments: boolean): Promise<void> => {
    const secret = await secretClient.getSecret("GIT-RSA");

    //TODO: having an encoding issue here, need to fix
    const secretValue = secret.value.split("\\n").join("\n");

    const auth = createAppAuth({
        id: parseInt(process.env["github_app_id"]),
        privateKey: secretValue,
        installationId: body.installation.id,
        clientSecret: process.env["GitClientSecret"]
    });

    const graphqlWithAuth = graphql.defaults({
        request: {
            hook: auth.hook
        }
    });

    const issueLookupQuery = `query($repoName:String!, $repoOwner:String!, $issueId:Int!){
        repository(name: $repoName, owner: $repoOwner) 
        {
            issue(number: $issueId) {
                bodyText
                id
                title
                comments(first: 50) {
                    edges {
                        node {
                            bodyText
                            author {
                                login
                            }
                        }
                    }
                }
            }
        }
      }`;

    try {
        const response: IssueResponse = await graphqlWithAuth(issueLookupQuery, {
            repoName: body.repository.name,
            repoOwner: body.repository.owner.login,
            issueId: body.issue.number
        });

        const updateMutation = `mutation($issueId:ID!, $newBody:String!){
        updateIssue(input: {id: $issueId, body: $newBody}) {
            issue {
              bodyText
              title
              state
            }
          }
        }`;

        //ignore here is because an unknown type is returned which typescript cannot process
        await graphqlWithAuth(updateMutation, {
            //@ts-ignore
            issueId: response.repository.issue.id,
            //@ts-ignore
            newBody: `${response.repository.issue.bodyText}\nAB#${workItemId}`
        });

        if (updateComments) {
            //update the comments in azure dev ops
            await addAllComments(context, response, workItemId);
        }
    }
    catch (err) {
        context.log(err);
    }
}

const getWorkId = (body: EventResponse): number => {
    // sample body text
    // "my sample description 2 hello [AB#46](https://ddyettonline.visualstudio.com/4a40311f-104a-4329-8d3

    const issueBody = body.issue && body.issue.body;

    if (!issueBody)
        return;

    let firstIndex = issueBody.indexOf("AB#");
    if (firstIndex == -1)
        return;

    const remainingBody = issueBody.substring(firstIndex + 3 /*AB#*/);
    firstIndex = remainingBody.indexOf("]")

    return parseInt(remainingBody.substring(0, firstIndex));
}

const closeWorkItem = async (context: Context, workItemId: number): Promise<void> => {

    try {
        const witApi = await connection.getWorkItemTrackingApi();

        witApi.updateWorkItem(undefined, [{
            "op": "add",
            "path": "/fields/System.State",
            "value": "Closed"
        }], workItemId)
    }
    catch (err) {
        context.log(err);
    }
}


const httpTrigger: AzureFunction = async function (context: Context, req: HttpRequest): Promise<void> {
    context.log('Received a new GitHub event');

    const connData = await connection.connect();
    context.log(`Hello ${connData.authenticatedUser.providerDisplayName}`);

    try {
        // eslint-disable-next-line prefer-destructuring
        const body: EventResponse = req.body;
        const action = body && body.action;

        if (!action) {
            //response isn't actually used so not worried about setting one
            return;
        }

        switch (action) {
            case `opened`:
                {
                    context.log("New issue opened received");
                    const repository = body.repository.name;

                    if (repository && data.autoPromote.indexOf(repository) > -1) {
                        context.log(`Auto Promote is enable for repo ${repository} so opening a new work item`);
                        const workItemId = await createNewWorkItem(context, body);
                        await updateGitHubIssue(context, body, workItemId, false /*updateComments*/);
                    }
                }
                break;
            case 'edited':
                {
                    if (req.headers && req.headers["x-github-event"] === 'issues') {
                        context.log("An issue has been edited event received");
                        const workItemId = getWorkId(body);

                        if (!workItemId || body.sender.login.indexOf("bot") > -1) {
                            context.log("Not a promoted issue so skipping")
                            return;
                        }

                        await updateWorkDescription(context, body, workItemId);
                    }
                }
                break;
            case 'assigned':
                {
                    context.log("Event raised for issue assignment");

                    const workItemId = getWorkId(body);

                    if (!workItemId) {
                        // not a tracked event so ignoring
                        return;
                    }

                    await updateAssignment(context, body, workItemId);
                }
                break;
            case `labeled`:
                {
                    context.log("New labeled event received");
                    // check for our custom labels.  
                    const customLabels: string[] = data.responseLabels;
                    const addedLabel = body.label && body.label.name;

                    if (addedLabel && customLabels && customLabels.indexOf(addedLabel) > -1) {
                        context.log(`The added label: ${addedLabel} is in the promotion list`);

                        //check if there is already a workitemid on the item and if so bail
                        let workItemId = getWorkId(body);
                        if (workItemId) {
                            return;
                        }

                        //newly added label says we should create a new workitem
                        workItemId = await createNewWorkItem(context, body);
                        await updateGitHubIssue(context, body, workItemId, true /*updateComments*/);
                    }
                }
                break;
            case `created`:
                {
                    if (req.headers && req.headers["x-github-event"] === 'issue_comment') {
                        context.log("New Comment Created");
                        const workItemId = getWorkId(body);

                        if (workItemId) {
                            addNewcomment(context, workItemId, body);
                        }
                    }
                }
                break;
            case `closed`:
                {
                    context.log("New issue closed event received");
                    const workItemId = getWorkId(body);

                    if (workItemId) {
                        context.log(`Preparing to close ${workItemId}`);
                        await closeWorkItem(context, workItemId);
                    }
                }
                break;
            default:
                // just throw away it's an event we don't need
                return;
        }
    }
    catch (err) {
        context.log(err);
    }
};

export default httpTrigger;
