# Payrolls from disk to Notion table

This script uploads a bunch of payrolls to a Notion database and Google Drive.

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
COMPANY=<company-name>
GOOGLE_DRIVE_PARENT_FOLDER_ID=<google-drive-parent-folder-id>
YEARS=<payroll-years>
```

### 3. Google Drive configuration
TO-DO

### 4. Notion configuration
To get the `NOTION_KEY` value:
1. Create your Notion API key [here](https://www.notion.com/my-integrations)
2. Copy that API key and set it in the `NOTION_KEY` env var (it will be something like `secret_dA89e3u9ufghvusrGqNS4QXiJHKxhTqimFyiAGPQi7n`)

To get the `NOTION_DEST_DATABASE_ID` value:
1. Go to the Notion database and do the following: `Options > Copy link`
2. The database id is the value immediatelly after the workspace id (example: `https://www.notion.so/<workspace-id>/<database-id>?<other-parameters>`)
3. Copy that `<workspace-id>` value and set it in the `NOTION_DEST_DATABASE_ID` env var

### 5. Run code

```sh
node index.js
```

If you receive the following error: `GaxiosError: invalid_grant`, then you should remove the `credentials.json` file and execute the app again.

## References
* https://github.com/makenotion/notion-sdk-js/tree/main/examples/database-email-update
* https://developers.notion.com/docs/create-a-notion-integration
* https://developers.google.com/drive/api/guides/about-sdk
* https://developers.google.com/drive/api/quickstart/nodejs
* https://developers.google.com/drive/api/guides/folder
* https://developers.google.com/drive/api/guides/search-files
