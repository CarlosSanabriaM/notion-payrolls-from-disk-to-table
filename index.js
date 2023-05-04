/* ================================================================================
  
  Find the official Notion API client @ https://github.com/makenotion/notion-sdk-js/

================================================================================ */

const { Client } = require("@notionhq/client")
const dotenv = require("dotenv")
const fs = require("fs");
const path = require("path");
const { PdfReader, Rule } = require("pdfreader");

//region Read config from .env file

dotenv.config()
const notion = new Client({ auth: process.env.NOTION_KEY })
const destDatabaseId = process.env.NOTION_DEST_DATABASE_ID
const company = process.env.COMPANY

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

//endregion

//region Classes

class Payroll {
  payrollNumber
  fileName
  filePath
  name
  date
  isExtra
  company = company
  file
  grossSalary
  deductions
  netSalary
}

//endregion

//region Functions

/**
 * Gets all the files from the payrolls folder.
 */
function getAllPayrollFileNames() {
  const folderPath = path.join(__dirname, 'payrolls')
  const files = fs.readdirSync(folderPath)
    .filter(file => !file.match('.gitkeep')); // ignore .gitkeep file

  // Log file names
  files.forEach((file) => console.log(file));

  return files
}

/**
 * Create a {@link Payroll} object from the given payroll file name.
 */
async function createPayrollFromPayrollFileName(payrollNumber, payrollFileName) {
  const payroll = new Payroll()

  // Store the payroll number, file path and file name
  payroll.payrollNumber = payrollNumber
  payroll.fileName = payrollFileName
  payroll.filePath = path.join(__dirname, 'payrolls', payrollFileName)

  // Set name and date
  setPayrollNameAndDate(payroll)

  // Set salary
  await setSalary(payroll)

  // Log payroll
  console.log(payroll)

  // The API currently does not support uploading new files.
  // https://developers.notion.com/docs/working-with-files-and-media#uploading-files-and-media-via-the-notion-api

  // Add payroll to the destination database
  // addPayrollToDestDatabase(payroll)
}

/**
 * Sets name and date in a {@link Payroll} object using the payroll file name.
 */
function setPayrollNameAndDate(payroll) {
  const regex = /(\d{4})-(\d{2})(-extra)?\.pdf$/ // matches four digits for the year and two digits for the month, with optional "-extra" text after the month
  const match = payroll.fileName.match(regex)

  if (match) {
    const year = match[1] // extract the year from the first capturing group
    const monthNumber = match[2] // extract the month from the second capturing group
    const isExtra = match[3] !== undefined // extract if is an extra payroll from the third capturing group
    const monthSpanish = monthNames[monthNumber] // use the dict to transform the month number to its spanish text

    //console.log(`fileName: ${payroll.fileName}, year: ${year}, month: ${monthNumber}, monthSpanish: ${monthSpanish}, isExtra: ${isExtra}`);

    payroll.name = `${year} ${monthSpanish}${(isExtra ? " Extra" : "")}`
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
 * Prints to the console the destination database schema.
 */
async function getDestDatabaseSchema() {
  const response = await notion.databases.retrieve({ database_id: destDatabaseId })
  console.log(response)
}

//endregion

//region Main

/**
 * Loop through each payroll file in payrolls folder, and for each one,
 * generate an object with the required info to populate the destination database,
 * and then add that object to the database.
 */
async function main() {
  let numPayrollFile = 0

  // Get all payroll file names
  const payrollFileNames = await getAllPayrollFileNames()
  // Loop through each payroll file name
  for (const payrollFileName of payrollFileNames) {
    // Increment the payroll number
    numPayrollFile++

    // Create a Payroll object with the payroll info
    createPayrollFromPayrollFileName(numPayrollFile, payrollFileName)
  }

  console.log(`\nTotal number of payroll files: ${numPayrollFile}\n`)
}

// getDestDatabaseSchema() // Uncomment to see the destination database schema
main()
//endregion
