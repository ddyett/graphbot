// eslint-disable-next-line no-unused-vars
import { AzureFunction, Context, HttpRequest } from "@azure/functions";
import * as smeeClient from "smee-client";

const smee = new smeeClient({
    source: 'https://smee.io/WVVXNYiH2HPE3ZX',
    target: 'http://localhost:7071/api/Webhook',
    logger: console
});

smee.start();

const httpTrigger: AzureFunction = async function (context: Context, req: HttpRequest): Promise<void> {
    context.log('HTTP trigger function processed a request.');
    const name = (req.query.name || (req.body && req.body.name));

    if (name) {
        context.res = {
            // status: 200, /* Defaults to 200 */
            body: "Hello " + (req.query.name || req.body.name)
        };
    }
    else {
        context.res = {
            status: 400,
            body: "Please pass a name on the query string or in the request body"
        };
    }
};

export default httpTrigger;
