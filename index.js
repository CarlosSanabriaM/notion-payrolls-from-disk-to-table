/* ================================================================================
  
  Find the official Notion API client @ https://github.com/makenotion/notion-sdk-js/

================================================================================ */

const { Client } = require("@notionhq/client")
const dotenv = require("dotenv")
const fs = require("fs");
const path = require("path");
const { PdfReader, Rule } = require("pdfreader");
const process = require('process');
const { authenticate } = require('@google-cloud/local-auth');
const { google } = require('googleapis');

//region Read config from .env file

dotenv.config()
const notion = new Client({ auth: process.env.NOTION_KEY })
const destDatabaseId = process.env.NOTION_DEST_DATABASE_ID
const company = process.env.COMPANY
const googleDriveParentFolderId = process.env.GOOGLE_DRIVE_PARENT_FOLDER_ID
const years = process.env.YEARS.split(',')

//endregion

//region Constants

const monthNames = {
  "01": "Enero",
  "02": "Febrero",
  "03": "Marzo",
  "04": "Abril",
  "05": "Mayo",
  "06": "Junio",
  "07": "Julio",
  "08": "Agosto",
  "09": "Septiembre",
  "10": "Octubre",
  "11": "Noviembre",
  "12": "Diciembre"
};

// Google API
const SCOPES = ['https://www.googleapis.com/auth/drive.file'];
// The file token.json stores the user's access and refresh tokens,
// and is created automatically when the authorization flow completes for the first time.
const TOKEN_PATH = path.join(process.cwd(), 'token.json');
const CREDENTIALS_PATH = path.join(process.cwd(), 'credentials.json');

//endregion

//region Classes

class Payroll {
  num
  fileName
  filePath
  name
  year
  date
  isExtra
  company = company
  grossSalary
  deductions
  netSalary
  googleDriveFileUrl
}

//endregion

//region Functions

function printYearsToProcess() {
  console.log("Years to process:")
  years.forEach(year => console.log(year));
  console.log("")
}

/**
 * Gets all the files from the payrolls folder.
 */
function getAllPayrollFileNames() {
  const folderPath = path.join(__dirname, 'payrolls')
  const files = fs.readdirSync(folderPath)
    .filter(file => !file.match('.gitkeep')) // ignore .gitkeep file
    .filter(file => years.some(year => file.includes(year))); // ignore files whose year is not in the years list

  console.log("\nPayroll files to process:")
  files.forEach(file => console.log(file));

  console.log(`\nTotal number of payroll files: ${files.length}\n`)

  return files
}

/**
 * Create a {@link Payroll} object from the given payroll file name.
 * @param {Drive} drive Google Drive client.
 */
async function createPayrollFromPayrollFileName(payrollNumber, payrollFileName, drive) {
  const payroll = new Payroll()

  // Store the payroll number, file path and file name
  payroll.num = payrollNumber
  payroll.fileName = payrollFileName
  payroll.filePath = path.join(__dirname, 'payrolls', payrollFileName)

  // Set name and date
  setNameAndDate(payroll)

  // Set salary
  await setSalary(payroll)

  // Log payroll
  console.log(payroll)

  // Get the id of the payroll year folder from Google Drive
  // The payroll file will be stored inside that folder
  const yearFolderId = await searchFolderInGoogleDrive(drive, payroll.year, googleDriveParentFolderId)
  // If the year folder doesn't exist, throw an Error
  if (yearFolderId == null)
    throw new Error(`Year folder ${payroll.year} doesn't exist in Google Drive inside the folder with id ${googleDriveParentFolderId}.
      That year must be specified in the 'YEARS' property in the .env file, so the script can create that folder.`)

  // Upload payroll file to Google Drive
  const fileId = await uploadPayrollFileToGoogleDrive(drive, payroll, yearFolderId)
  payroll.googleDriveFileUrl = getGoogleDriveFileUrlFromId(fileId)

  // Add payroll to the destination database
  addPayrollToDestDatabase(payroll)
}

/**
 * Sets name and date in a {@link Payroll} object using the payroll file name.
 */
function setNameAndDate(payroll) {
  const regex = /(\d{4})-(\d{2})(-extra)?\.pdf$/ // matches four digits for the year and two digits for the month, with optional "-extra" text after the month
  const match = payroll.fileName.match(regex)

  if (match) {
    const year = match[1] // extract the year from the first capturing group
    const monthNumber = match[2] // extract the month from the second capturing group
    const isExtra = match[3] !== undefined // extract if is an extra payroll from the third capturing group
    const monthSpanish = monthNames[monthNumber] // use the dict to transform the month number to its spanish text

    //console.log(`fileName: ${payroll.fileName}, year: ${year}, month: ${monthNumber}, monthSpanish: ${monthSpanish}, isExtra: ${isExtra}`);

    payroll.name = `${year} ${monthSpanish}${(isExtra ? " Extra" : "")}`
    payroll.year = year
    payroll.date = `${year}-${monthNumber}-25` // all dates use 25 as the day
    payroll.isExtra = isExtra
  } else {
    throw new Error(`The payroll file ${payroll.fileName} doesn't match the regex.`)
  }
}

/**
 * Sets the file in a {@link Payroll} object.
 */
async function setSalary(payroll) {
  var row, previousY

  // The parseFileItems() function is an async function that receives a callback that can be called multiple times.
  // Is asynchronous, so the execution doesn't wait for it to finish, but we need to wait until we get the following values: grossSalary, deductions and netSalary.
  // To fix this, we create a Promise that waits until it receives a callback invocation with the netSalary.
  return new Promise((resolve, reject) => {
    // Read the PDF file line by line and set the grossSalary, deductions and netSalary
    new PdfReader().parseFileItems(payroll.filePath, function (err, item) {
      // If item and item.text are defined
      if (item && item.text) {
        // The y represents the vertical position of the item
        // If the y value of the current item is different from the y value of the previous item,
        // then we are in a new row, and we can discard the contents of the previous row, because we don't need them
        if (item.y != previousY) {
          row = [] // start new row with 0 items
          previousY = item.y
        }

        // Accumulate text items of the current row
        row.push(item.text)

        // If we have 2 items, then we may have one of the ammounts we are looking for
        if (row.length == 2) {
          switch (row[0]) {
            case "A. TOTAL DEVENGADO":
              payroll.grossSalary = parseSpanishFloatStringtoFloat(row[1])
              break;
            case "B. TOTAL A DEDUCIR":
              payroll.deductions = parseSpanishFloatStringtoFloat(row[1])
              break;
            case "LIQUIDO TOTAL A PERCIBIR (A-B)":
              payroll.netSalary = parseSpanishFloatStringtoFloat(row[1])
              // Resolve the promise to signal that we're done
              resolve()
              break;
          }
        }
      }
    });
  });
}

/**
 * Example: "2.345,67" -> 2345.67
 */
function parseSpanishFloatStringtoFloat(numString) {
  return parseFloat(
    numString
      .replace(".", "")
      .replace(",", ".")
  );
}

/**
 * Creates a Google Drive client to interact with Google Drive using the NodeJS SDK.
 */
async function createGoogleDriveClient() {
  // Create an authorized OAuth2 client to interact with Google Drive
  // Loads authorization data stored in token.json file, or requests authorization to the user and stores it in token.json
  const authClient = await authorize()
  // Create Google Drive client
  return google.drive({ version: 'v3', auth: authClient });
}

/**
 * Reads previously authorized credentials from the save file.
 *
 * @return {Promise<OAuth2Client|null>}
 */
async function loadSavedCredentialsIfExist() {
  try {
    const content = fs.readFileSync(TOKEN_PATH);
    const credentials = JSON.parse(content);
    return google.auth.fromJSON(credentials);
  } catch (err) {
    return null;
  }
}

/**
 * Serializes credentials to a file compatible with GoogleAUth.fromJSON.
 *
 * @param {OAuth2Client} client
 * @return {Promise<void>}
 */
async function saveCredentials(client) {
  const content = fs.readFileSync(CREDENTIALS_PATH);
  const keys = JSON.parse(content);
  const key = keys.installed || keys.web;
  const payload = JSON.stringify({
    type: 'authorized_user',
    client_id: key.client_id,
    client_secret: key.client_secret,
    refresh_token: client.credentials.refresh_token,
  });
  fs.writeFileSync(TOKEN_PATH, payload);
}

/**
 * Load or request authorization to call APIs.
 *
 * - If token.json file exists and contains previously authorized credentials,
 * it uses them to create the Google client.
 *
 * - If token.json doesn't exist or it doesn't contain previously authorized credentials,
 * it asks the user to authenticate, creates the Google client, and stores the credentials in token.json.
 *
 */
async function authorize() {
  let client = await loadSavedCredentialsIfExist();
  if (client) {
    return client;
  }
  client = await authenticate({
    scopes: SCOPES,
    keyfilePath: CREDENTIALS_PATH,
  });
  if (client.credentials) {
    await saveCredentials(client);
  }
  return client;
}

/**
 * Creates a folder in Google Drive (if not exists already).
 * Returns the folder id.
 * @param {Drive} drive Google Drive client.
 */
async function createFolderInGoogleDriveIfNotExists(drive, folderName, parentFolderId) {
  // Search folder to see if it already exists
  const folderId = await searchFolderInGoogleDrive(drive, folderName, parentFolderId)

  if(folderId != null){
    // If the folder exists, simply return its id
    console.log(`Folder ${folderName} already exists. Id: ${folderId}.`)
    return folderId
  } else {
    // If the folder doesn't exist, create it, and return its id
    return await createFolderInGoogleDrive(drive, folderName, parentFolderId)
  }
}

/**
 * Creates a folder in Google Drive inside the specified parent folder.
 * @param {Drive} drive Google Drive client.
 */
async function createFolderInGoogleDrive(drive, folderName, parentFolderId) {
  const res = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentFolderId] // create folder inside the specified folder
    },
    fields: 'id'
  });
  console.log(`Created folder in Google Drive. Folder name: ${folderName}. Folder id: ${res.data.id}`);

  return res.data.id
}

/**
 * Uploads a payroll file to Google Drive to the specified parent folder.
 * Returns the payroll file id.
 * @param {Drive} drive Google Drive client.
 */
async function uploadPayrollFileToGoogleDrive(drive, payroll, parentFolderId) {
  console.log(`Upload payroll file to Google Drive. Payroll file name: ${payroll.fileName}. Parent folder id: ${parentFolderId}.`);
  const res = await drive.files.create({
    requestBody: {
      name: payroll.fileName,
      mimeType: 'application/pdf',
      parents: [parentFolderId] // create folder inside the specified folder
    },
    media: {
      mimeType: 'application/pdf',
      body: fs.createReadStream(payroll.filePath)
    }
  });
  console.log(res.data);
  return res.data.id
}

/**
 * Search folder in Google Drive inside the specified parent folder.
 * Only searches for non-trashed folders.
 * @param {Drive} drive Google Drive client.
 *
 * @return {string|null} The folder id if there was exactly one match, or null if there is no match.
 * */
async function searchFolderInGoogleDrive(drive, folderName, parentFolderId) {
  const res = await drive.files.list({
    q: `mimeType='application/vnd.google-apps.folder' and name='${folderName}' and parents in '${parentFolderId}' and trashed = false`,
    fields: 'nextPageToken, files(id, name, createdTime, parents)',
    spaces: 'drive',
  });
  const matchedFolders = res.data.files

  // Log all matches
  matchedFolders.forEach((folder) => console.log(`Found folder. Name: ${folder.name}. Id: ${folder.id}. Created time: ${folder.createdTime}. Parents: ${folder.parents}.`));

  // If there is more than 1 match, throw an Error
  if (matchedFolders.length > 1)
    throw new Error("There is more than 1 folder match. The folder may not exist, or may exist once, but not multitple times.")

  // Return the folder id if it was found and null otherwise
  return matchedFolders.length == 1 ? matchedFolders[0].id : null;
}

/**
 * Returns the URL that can be used to view the file with the specified id.
 * @param {string} fileId Google Drive file id.
 */
function getGoogleDriveFileUrlFromId(fileId) {
  return `https://drive.google.com/file/d/${fileId}/view`
}

/**
 * Prints to the console the destination database schema.
 */
async function getDestDatabaseSchema() {
  const response = await notion.databases.retrieve({ database_id: destDatabaseId })
  console.log(response)
}

/**
 * Adds a {@link Payroll} to the Notion destination database.
 */
async function addPayrollToDestDatabase(payroll) {
  try {
    await notion.pages.create({
      parent: { database_id: destDatabaseId },
      // https://developers.notion.com/reference/property-value-object
      properties: {
        "Nómina": {
          title: [
            {
              "text": {
                "content": payroll.name,
              },
            },
          ],
        },
        "Fecha": {
          "date": {
            "start": payroll.date
          }
        },
        "Empresa": {
          "select": {
            "name": payroll.company
          }
        },
        "Fichero": {
          "url": payroll.googleDriveFileUrl
        },
        "Dinero bruto": {
          "number": payroll.grossSalary
        },
        "Dinero a deducir": {
          "number": payroll.deductions
        },
        "Dinero neto": {
          "number": payroll.netSalary
        }
      },
    })
    console.log(`Payroll ${payroll.num} (${payroll.fileName}) successfully added to the destination database.`)
  } catch (error) {
    console.error(`Payroll ${payroll.num} (${payroll.fileName}) could not be added to the destination database.`)
    console.error("Error:", error.body)
  }
}

//endregion

//region Main

/**
 * Loop through each payroll file in payrolls folder, and for each one,
 * generate an object with the required info to populate the destination database,
 * and then add that object to the database.
 */
async function main() {
  // Create Google Drive client
  const drive = await createGoogleDriveClient()

  // Create folders in Google Drive for the specified payroll years if they don't exist
  printYearsToProcess()
  console.log("Create folders for the payroll years if they don't exist.")
  for(const year of years) {
    await createFolderInGoogleDriveIfNotExists(drive, year, googleDriveParentFolderId)
  }

  let numPayrollFile = 0
  // Get all payroll file names
  const payrollFileNames = await getAllPayrollFileNames()
  // Loop through each payroll file name
  for (const payrollFileName of payrollFileNames) {
    // Increment the payroll number
    numPayrollFile++

    // Create a Payroll object with the payroll info
    createPayrollFromPayrollFileName(numPayrollFile, payrollFileName, drive)
  }
}

// getDestDatabaseSchema() // Uncomment to see the destination database schema
main()

//endregion
