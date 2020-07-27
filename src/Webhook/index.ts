// eslint-disable-next-line no-unused-vars
import { AzureFunction, Context, HttpRequest } from "@azure/functions";
import * as smeeClient from "smee-client";
import * as fs from 'fs';

const config = JSON.parse(fs.readFileSync("config.json", "utf8"))

const smee = new smeeClient({
    source: config.webproxy_url,
    target: 'http://localhost:7071/api/Webhook',
    logger: console
});

smee.start();

const httpTrigger: AzureFunction = async function (context: Context, req: HttpRequest): Promise<void> {
    context.log('Received a new GitHub event');

    let action: String = req.body && req.body.action;

    if (action && action === 'labeled') {
        let newLabel: String = req.body.label && req.body.label.name;

        if (config.responseLabels.indexOf(newLabel) === -1)
            return;
            
        context.res = {
            // status: 200, /* Defaults to 200 */
            body: "Hello " + (req.query.name || req.body.name)
        };
    }
};

export default httpTrigger;
