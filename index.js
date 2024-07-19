import { ethers } from 'ethers';
import fs from 'fs'; 
import dotenv from 'dotenv'; 
import { fetchQuery, init } from "@airstack/node";

dotenv.config(); // Load environment variables from .env file

// Path to the CSV file
const filePath = './data/test-claims.csv';
const timestampDelta = 120; // max time difference between send and receive bridge transactions (if it's larger than this, txs may not be part of the same bridging action)

// Initialize the AirStack SDK
init(process.env.AIRSTACK_API_KEY);

console.log('Starting the script...');

// MAIN SCRIPT FUNCTION
async function main() {
  // Read the CSV file
  fs.readFile(filePath, 'utf8', async (err, data) => {
    if (err) {
      console.error('Error reading CSV file:', err);
      return;
    }

    // Split data into lines
    const lines = data.split('\n');

    // Skip the header row
    const parsedData = lines.slice(1).map(parseRow);

    console.log('Number of claims:', parsedData.length);

    const processedHashesValid = []; // processed tx hashes of valid claims
    const processedHashesNonValid = []; // processed tx hashes of non-valid claims

    const resultFilePath = `./results/all-results-${new Date().getTime()}.csv`;
    const resultOnlyValidFilePath = `./results/valid-results-${new Date().getTime()}.csv`;

    // add header row to the all results file
    fs.appendFile(resultFilePath, 'claimValidity,amountLost,userAddress,contactInfo,notes,sentAmount,receivedAmount,degenTxHash,baseTxHash,sentDatetime,receivedDatetime,userReportedSentAmount,userReportedReceivedAmount,additionalInfo\n', (err) => {
      if (err) {
        console.error('Error writing to result file:', err);
        return;
      }
    });

    // add header row to the valid results file
    fs.appendFile(resultOnlyValidFilePath, 'claimValidity,amountLost,userAddress,contactInfo,notes,sentAmount,receivedAmount,degenTxHash,baseTxHash,sentDatetime,receivedDatetime,userReportedSentAmount,userReportedReceivedAmount,additionalInfo\n', (err) => {
      if (err) {
        console.error('Error writing to result file:', err);
        return;
      }
    });

    // Loop through parsed data
    for (const row of parsedData) {
      let notes = '';
      let valid = true;

      // check if row.degenTxHash has already been processed in a valid claim
      if (processedHashesValid.includes(String(row.degenTxHash).toLowerCase())) {
        notes += 'This claim transaction hash on Degen Chain has already been processed in a previous valid claim. ';
        valid = false;
      }

      // check if row.baseTxHash has already been processed in a valid claim
      if (processedHashesValid.includes(String(row.baseTxHash).toLowerCase())) {
        notes += 'This claim transaction hash on Base has already been processed in a previous valid claim. ';
        valid = false;
      }

      // check if row.degenTxHash has already been processed in a non-valid claim
      if (processedHashesNonValid.includes(String(row.degenTxHash).toLowerCase()) && valid) {
        notes += 'There is a previous non-valid claim with the same transaction hash on Degen Chain. But because that claim was not valid this one could still be valid. ';
      }

      // check if row.baseTxHash has already been processed in a non-valid claim
      if (processedHashesNonValid.includes(String(row.baseTxHash).toLowerCase()) && valid) {
        notes += 'There is a previous non-valid claim with the same transaction hash on Base. But because that claim was not valid this one could still be valid. ';
      }

      // check if row.walletAddress is a valid address
      if (!ethers.utils.isAddress(row.walletAddress)) {
        notes += 'Invalid wallet address. ';
        valid = false;
      }

      // Verify degen chain transaction data (send tx)
      const degenTxData = await getDegenTxData(row.walletAddress, row.degenTxHash, notes)
      notes = degenTxData.notes;

      if (!degenTxData.valid) {
        valid = false;
      }

      // Verify base transaction data (receive tx)
      const baseTxData = await getBaseTxData(row.walletAddress, row.baseTxHash, notes)
      notes = baseTxData.notes;

      if (!baseTxData.valid) {
        valid = false;
      }

      // check user reported degen amount
      // if it's off by more than 10%, add a note
      if (Math.abs(degenTxData.amount - row.degenAmount) > 0.1 * row.degenAmount) {
        notes += 'User reported DEGEN amount sent on Degen Chain is off by more than 10%. ';
      }

      // check user reported base amount
      // if it's off by more than 10%, add a note
      if (Math.abs(baseTxData.amount - row.baseAmount) > 0.1 * row.baseAmount) {
        notes += 'User reported BASE amount received on Base Chain is off by more than 10%. ';
      }

      // check if the time difference between the two transactions is less than the timestampDelta
      if (Math.abs(new Date(degenTxData.datetime) - new Date(baseTxData.datetime)) > timestampDelta * 1000) {
        notes += `Timestamp difference between Degen and Base transactions is greater than ${timestampDelta} seconds. This means these two txs may not be part of the same bridging action. `;
        valid = false;
      }

      // Add the tx hashes to the processedHashes array
      if (valid) {
        processedHashesValid.push(String(row.degenTxHash).toLowerCase());
        processedHashesValid.push(String(row.baseTxHash).toLowerCase());
      } else {
        processedHashesNonValid.push(String(row.degenTxHash).toLowerCase());
        processedHashesNonValid.push(String(row.baseTxHash).toLowerCase());
      }

      let amountLost = null; // DEGEN amount lost in the bridging action

      if (valid) {
        amountLost = Number(degenTxData.amount) - Number(baseTxData.amount);
      }

      // final data for the result CSV file
      const resultData = {
        claimValidity: valid,
        amountLost: amountLost,
        userAddress: row.walletAddress,
        contactInfo: row.contactInfo,
        notes: notes,
        sentAmount: degenTxData.amount,
        receivedAmount: baseTxData.amount,
        degenTxHash: row.degenTxHash,
        baseTxHash: row.baseTxHash,
        sentDatetime: degenTxData.datetime,
        receivedDatetime: baseTxData.datetime,
        userReportedSentAmount: row.degenAmount,
        userReportedReceivedAmount: row.baseAmount,
        additionalInfo: row.additionalInfo,
      }

      // store data in the all results CSV file
      fs.appendFile(resultFilePath, `${Object.values(resultData).join(',')}\n`, (err) => {
        if (err) {
          console.error('Error writing to result file:', err);
          return;
        }
      });

      // store data in the valid results CSV file
      if (valid) {
        fs.appendFile(resultOnlyValidFilePath, `${Object.values(resultData).join(',')}\n`, (err) => {
          if (err) {
            console.error('Error writing to result file:', err);
            return;
          }
        });
      }
      
    }
    
  });

  console.log('END');
}

// Function to parse a single CSV row
function parseRow(row) {
  const [
    claimId,
    walletAddress,
    degenAmount,
    degenTxHash,
    baseAmount,
    baseTxHash,
    contactInfo,
    additionalInfo,
    responseType,
    startDate,
    stageDate,
    submitDate,
    networkId,
    tags,
  ] = row.split(',');

  // Remove leading/trailing quotes (if any)
  return {
    claimId: claimId,
    walletAddress: walletAddress ? walletAddress.trim().replace(/^"|"$|^'|'$/g, '') : walletAddress,
    degenAmount: degenAmount ? parseFloat(degenAmount) : degenAmount,
    degenTxHash: degenTxHash ? degenTxHash.trim().replace(/^"|"$|^'|'$/g, '') : degenTxHash,
    baseAmount: baseAmount ? parseFloat(baseAmount) : baseAmount,
    baseTxHash: baseTxHash ? baseTxHash.trim().replace(/^"|"$|^'|'$/g, '') : baseTxHash,
    contactInfo: contactInfo ? contactInfo.trim().replace(/^"|"$|^'|'$/g, '') : contactInfo,
    additionalInfo: additionalInfo ? additionalInfo.trim().replace(/^"|"$|^'|'$/g, '') : additionalInfo,
    responseType,
    startDate: startDate,
    stageDate: stageDate,
    submitDate: submitDate,
    networkId,
    tags: tags,
  };
}

// verify degen transaction data
async function getBaseTxData(userAddress, txHash, notes) {

  if (!txHash) {
    return {
      amount: 0,
      datetime: null,
      notes: notes + 'No Base transaction hash provided. ',
      valid: false,
    }
  }

  if (!txHash.startsWith('0x')) {
    return {
      amount: 0,
      datetime: null,
      notes: notes + 'Invalid Base transaction hash. ',
      valid: false,
    }
  }

  // The "tokenAddress" value ("0x4ed4...fefed") is the address of the DEGEN token on Base
  // The "from" value ("0x777e...f531") is the bridge relayer address
  const query = `
    query {
      TokenTransfers(
        input: {
          blockchain: base, 
          filter: {
            tokenAddress: {_eq: "0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed"}, 
            to: {_eq: "${userAddress}"}, 
            from: {_eq: "0x777e05D02Ea7B42F32f103c089C175017082f531"},
            transactionHash: {_eq: "${txHash}"}
          }
        }
      ) {
        TokenTransfer {
          blockTimestamp
          formattedAmount
          to {
            addresses
          }
        }
      }
    }
  `;

  const response = await fetchQuery(query);

  const resObjects = response["data"]["TokenTransfers"]["TokenTransfer"];

  //console.log('resObjects:', resObjects);

  if (!resObjects || resObjects.length === 0) {
    return {
      amount: 0,
      datetime: null,
      notes: notes + 'No Base transaction found. ',
      valid: false,
    };
  }

  let amount = 0;
  let toAddress;
  let blockTimestamp;

  for (const resObject of resObjects) {
    if (resObject?.blockTimestamp && resObject?.formattedAmount && resObject?.to?.addresses?.length > 0) {
      blockTimestamp = resObject.blockTimestamp;
      
      if (Number(resObject.formattedAmount) > amount) {
        amount = resObject.formattedAmount;
      }
      
      toAddress = resObject.to.addresses[0];
    }
  }

  let txNotes = notes;
  let valid = true;

  if (String(userAddress).toLowerCase() !== String(toAddress).toLowerCase()) {
    txNotes += 'User address in Base transaction does not match user address in the form. ';
    valid = false;
  }

  return {
    amount: amount,
    datetime: blockTimestamp,
    notes: txNotes,
    valid: valid,
  };
}

// verify degen transaction data
async function getDegenTxData(userAddress, txHash, notes) {

  if (!txHash) {
    return {
      amount: 0,
      datetime: null,
      notes: notes + 'No Degen Chain transaction hash provided. ',
      valid: false,
    }
  }

  if (!txHash.startsWith('0x')) {
    return {
      amount: 0,
      datetime: null,
      notes: notes + 'Invalid Degen Chain transaction hash. ',
      valid: false,
    }
  }
  
  // The "to" value ("0x43019...2de2") is the address of the DEGEN/ETH ProxySwap pool
  const query = `
    query {
      TokenTransfers(
        input: {
          blockchain: degen, 
          filter: {
            to: {_eq: "0x43019F8BE1F192587883b67dEA2994999f5a2de2"}, 
            transactionHash: {_eq: "${txHash}"}
          }
        }
      ) {
        TokenTransfer {
          blockTimestamp
          formattedAmount
          operator {
            addresses
          }
        }
      }
    }
  `;

  const response = await fetchQuery(query);

  const resObjects = response["data"]["TokenTransfers"]["TokenTransfer"];

  if (!resObjects || resObjects.length === 0) {
    return {
      amount: 0,
      datetime: null,
      notes: notes + 'No Degen Chain transaction found. ',
      valid: false,
    };
  }

  let amount = 0;
  let operatorAddress;
  let blockTimestamp;

  for (const resObject of resObjects) {
    if (resObject?.blockTimestamp && resObject?.formattedAmount && resObject?.operator?.addresses?.length > 0) {
      blockTimestamp = resObject.blockTimestamp;
      
      if (Number(resObject.formattedAmount) > amount) {
        amount = resObject.formattedAmount;
      }
      
      operatorAddress = resObject.operator.addresses[0];
    }
  }

  let txNotes = notes;
  let valid = true;

  if (String(userAddress).toLowerCase() !== String(operatorAddress).toLowerCase()) {
    txNotes += 'User address in Degen Chain transaction does not match user address in the form. ';
    valid = false;
  }

  return {
    amount: amount,
    datetime: blockTimestamp,
    notes: txNotes,
    valid: valid,
  };
}

// Run the main function
main();