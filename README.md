# Payrolls from disk to Notion table

This script uploads a bunch of payrolls to a Notion table and Google Drive.

* The file itself is stored in Google Drive
* Some info and the URL of each file is also stored in a Notion database

> ℹ️ [The Notion API currently does not support uploading new files.](https://developers.notion.com/docs/working-with-files-and-media#uploading-files-and-media-via-the-notion-api)
> 
> To solve this, Notion recommends to host the files externally and specify the link in Notion.
>
> This is the reason why payroll files are stored in Google Drive.

## Running locally

### 1. Setup your local project

```sh
# Switch into this project
cd notion-payrolls-from-disk-to-table/

# Install the dependencies
npm install
```

### 2. Set your environment variables in a `.env` file

```ini
NOTION_KEY=<your-notion-api-key>
NOTION_DEST_DATABASE_ID=<your-notion-destination-database-id>
```

You can create your Notion API key [here](https://www.notion.com/my-integrations).

### 3. Run code

```sh
node index.js
```

## References
* https://github.com/makenotion/notion-sdk-js/tree/main/examples/database-email-update
* https://developers.notion.com/docs/create-a-notion-integration
* https://developers.google.com/drive/api/guides/about-sdk
* https://developers.google.com/drive/api/quickstart/nodejs
* https://developers.google.com/drive/api/guides/folder
