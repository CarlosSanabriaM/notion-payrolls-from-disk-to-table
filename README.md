# Payrolls from disk to Notion table

This script uploads a bunch of payrolls to a Notion table.

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
