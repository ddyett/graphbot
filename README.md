# Microsoft Graph BOT

The Microsoft Graph BOT allows for automatically moving and GitHub issues into Azure Dev Ops workitems and keeping some changes in sync.

This is developed as an Azure function using [TypeScript](https://www.typescriptlang.org/) and requires setting up a [GitHub Application](https://docs.github.com/en/developers/apps/creating-a-github-app)

# Running Locally

1. The application uses [smee](http://smee.io) for local testing.  Go to [smee](http://smee.io) and set up a new channel.
2. Set up a [GitHub Application](https://docs.github.com/en/developers/apps/creating-a-github-app)
    * Use the url from smee as your callback url 
    * You will need read and write permission for issues
    * Register for issue comments, label, and issues events
    * create a secret for your Git application
3. Set up an azure key vault where you will need to store your private key.  The secret should be called GitClientSecret
4. Once your GitHubApplication is created generate and download your private key, PEM file.
5. Store the key as a secret in Azure Key Vault using 'GIT-RSA' as the name of the secret
6. In Azure go to active directory and register a new application.  You'll need the client id and tenant id which you'll specifiy in local.settings.json
7. After creating the registration, go to 'certificates and secrets' and create a new client secret.  Make sure to capture the value as it can never be grabbed again.
8. Clone the rep.
9. Run 'npm install'
10. Create a local.settings.json file or rename the local.settings.sample.json file.
11. Fill in the properties of local.settings.json to capture information about your key vault settings and GitHub app.
    * You will also need a personal access token to perform actions against the azure dev environment.
    * Go to your azure project and at the top right click on the user settings icon then personal access tokens.
    * This will allow you to create a new token. This application only requres read and write permissions to work items.
12. Run npm start to get things going 

