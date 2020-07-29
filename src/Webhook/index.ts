// eslint-disable-next-line no-unused-vars
import { AzureFunction, Context, HttpRequest } from "@azure/functions";
import * as fs from 'fs';
import * as azdev from "azure-devops-node-api";
import { createAppAuth } from "@octokit/auth-app";
import { graphql } from "@octokit/graphql";
import smeeClient = require("smee-client"); //had to do this due to esmoduleinterop being true


const token: string = process.env["ADOToken"]; // e.g "cbdeb34vzyuk5l4gxc4qfczn3lko3avfkfqyb47etahq6axpcqha"; 

//TODO: need to move this to key vault and load the secret
const privateKey = fs.readFileSync("graphbot.pem", "utf8")

// establish connection to azure
const authHandler = azdev.getPersonalAccessTokenHandler(token);
const connection = new azdev.WebApi(process.env["VSInstance"], authHandler);

//TODO: Add check for development environment
const smee = new smeeClient({
    source: process.env["webproxy_url"],
    target: 'http://localhost:7071/api/Webhook'
});

smee.start();

//TODO: get this moved to a config file
const RepoAreaMapping = {
    "graphbot-demo": "Video Project\\Area A"
};

const createNewbug = async (context: Context, req: HttpRequest): Promise<number> => {

    interface AreaMapping {
        [repoName: string]: { areaPath: string };
    }

    const description: string = req.body.issue && req.body.issue.body;

    if (description && description.indexOf('AB#') > -1) {
        // this item is already tracked by work in azure boards so abort;
        return;
    }

    // figure out if this should be filed as a bug or an issue by looking at the labels on the issue
    const labels = req.body.issue && req.body.issue.labels;
    const workType: string = labels.some((value) => value.name.indexOf(process.env["bugLabel"])) ? process.env["BugName"] : process.env["UserStoryName"];
    const descriptionField: string = workType === process.env["BugName"] ? process.env["BugDescriptionField"] : process.env["UserStoryDescriptionField"];

    //grab the area for this particular repo.
    const areaPath: AreaMapping = RepoAreaMapping[req.body.repository.name];

    const witApi = await connection.getWorkItemTrackingApi();
    const result = await witApi.createWorkItem({},
        [
            {
                "op": "add",
                "path": "/fields/System.Title",
                "from": null,
                "value": `${req.body.issue.title}`
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

const addAllComments = async (context: Context, issueData: any /*graphql response object*/, workItemId: number): Promise<void> => {
    try {
        const commentsSection = issueData.repository.issue.comments.edges;

        if (!commentsSection || commentsSection.length === 0)
            return;

        commentsSection.forEach(async section => {
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

const addNewcomment = async (context: Context, workItemId: number, req: HttpRequest): Promise<void> => {
    const comment: string = req.body.comment && req.body.comment.body;
    const user: string = req.body.comment.user.login;

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

const updateGitHubIssue = async (context: Context, req: HttpRequest, workItemId: number, updateComments: boolean): Promise<void> => {
    const auth = createAppAuth({
        id: parseInt(process.env["github_app_id"]),
        privateKey: privateKey,
        installationId: req.body.installation.id
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
                comments(first: 10) {
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
        const response = await graphqlWithAuth(issueLookupQuery, {
            repoName: req.body.repository.name,
            repoOwner: req.body.repository.owner.login,
            issueId: req.body.issue.number
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

const getWorkId = (req: HttpRequest): number => {
    // sample request
    // "my sample description 2 hello [AB#46](https://ddyettonline.visualstudio.com/4a40311f-104a-4329-8d3

    const issueBody: string = req.body.issue && req.body.issue.body;

    if (!issueBody)
        return;

    let firstIndex = issueBody.indexOf("AB#");
    if (firstIndex == -1)
        return;

    const remainingBody = issueBody.substring(firstIndex + 3 /*AB#*/);
    firstIndex = remainingBody.indexOf("]")

    return parseInt(remainingBody.substring(0, firstIndex));
}

const closeWorkItem = async (context: Context, req: HttpRequest, workItemId: number): Promise<void> => {

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
        const action: string = req.body && req.body.action;

        if (!action) {
            //response isn't actually used so not worried about setting one
            return;
        }

        switch (action) {
            case `opened`:
                {
                    context.log("New issue opened received");
                    const workItemId = await createNewbug(context, req);
                    await updateGitHubIssue(context, req, workItemId, false /*updateComments*/);
                }
                break;
            case `labeled`:
                {
                    context.log("New labeled event received");
                    // check for our custom labels.  
                    const customLabels: string[] = JSON.parse(process.env["responseLabels"]);
                    const addedLabel: string = req.body.label && req.body.label.name;

                    if (addedLabel && customLabels && customLabels.indexOf(addedLabel) > -1) {
                        //newly added label says we should create a new workitem
                        const workItemId = await createNewbug(context, req);
                        await updateGitHubIssue(context, req, workItemId, true /*updateComments*/);
                    }
                }
                break;
            case `created`:
                {
                    if (req.headers && req.headers["x-github-event"] === 'issue_comment') {
                        context.log("New Comment Created");
                        const workItemId = getWorkId(req);

                        if (workItemId) {
                            addNewcomment(context, workItemId, req);
                        }
                    }
                }
                break;
            case `closed`:
                {
                    context.log("New issue closed event received");
                    const workItemId = getWorkId(req);

                    if (workItemId) {
                        context.log(`Preparing to close ${workItemId}`);
                        await closeWorkItem(context, req, workItemId);
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
