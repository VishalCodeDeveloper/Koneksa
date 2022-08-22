const cp = require('child_process');
const { Console } = require('console');
// This script requires the 'request' node.js module.
// This section grabs required node modules not packaged with
// the Automation Host service prior to executing the script.

const req = async module => {
    try {
        require.resolve(module);
    } catch (e) {
        console.log(`=== could not resolve "${module}" ===\n=== installing... ===`);
        cp.execSync(`npm install ${module}`);
        await setImmediate(() => { });
        console.log(`=== "${module}" has been installed ===`);
    }
    console.log(`=== requiring "${module}" ===`);
    try {
        return require(module);
    } catch (e) {
        console.log(`=== could not include "${module}" ===`);
        console.log(e);
        process.exit(1);
    }
}

const formatSizeUnits = async (bytes) => {
    if (bytes > 0) {
        bytes = (bytes / 1048576).toFixed(4);
    } else {
        bytes = 0;
    }
    return bytes;
}

const main = async () => {

    const { execSync } = await req("child_process");
    const fs = await req('fs');
    const path = await req('path');
    const request = await req('request');

    var customFieldData = {
        0: {
            //"id": 42066045, number type field 
            "Environment": ["Development", "Production"], //check box field
            "Component": "Jobs", //combobox type field
            "Assignee": "Hrushikesh Silam", //string type field
            "Created On": "2022-06-21T12:10:41+05:30", //date type and datetime type field
            "Modified On": "2022-06-21T12:10:41+05:30", //date type and datetime type field
            "References": "https://integration.qtestnet.com/p/112147/portal/project#tab=testdesign&object=1&id=42066045", //url type field
            "Test Case Type": ["Functionality", "Performance", "Security", "Database", "Regression"], // multiselect field
            "Assigned To": ["Vishal Bhuyar", "Varsha Dahatonde"] //user list field
        },
        1: {
            "Priority": "Low",
            "Planned Start Date": "2022-06-21T12:10:41+05:30",
            "Assigned To": "Varsha Dahatonde" //user list in run is sigle select field
        }
    }

    const ProcessTestCaseFromFile = async (resultNum, testResults) => {
        console.log('=== entering function ProcessTestCaseFromFile ===');
        var testCasesList = testResults[resultNum].elements.splice(0, testResults[resultNum].elements.length);
        for (let i = 0; i < testCasesList.length; i++) {
            testResults[resultNum].elements = [];
            let bufferSize = await formatSizeUnits(Buffer.byteLength(JSON.stringify(testCasesList[i]), 'ascii'));
            if (bufferSize >= 7) {
                var teststepList = testCasesList[i].steps.splice(0, testCasesList[i].steps.length);
                testResults[resultNum].elements.push(testCasesList[i]);
                var isIntegrationPending = false;
                var processedTestSteps = 0;
                for (let j = 0; j < teststepList.length; j++) {
                    processedTestSteps++;
                    testResults[resultNum].elements[0].steps.push(teststepList[j]);
                    bufferSize = await formatSizeUnits(Buffer.byteLength(JSON.stringify(testResults[resultNum].elements), 'ascii'));
                    if (bufferSize >= 7) {
                        console.log('Test step processing number : ' + processedTestSteps);
                        await FireWebhookWithTestData(JSON.stringify(testResults));
                        testResults[resultNum].elements[0].steps = [];
                        isIntegrationPending = false;
                    }
                    else {
                        isIntegrationPending = true;
                    }
                }
                if (isIntegrationPending && testResults[resultNum].elements[0].steps.length > 0) {
                    console.log('Test step processing number : ' + processedTestSteps);
                    await FireWebhookWithTestData(JSON.stringify(testResults));
                    isIntegrationPending = false;
                }
            }
            else {
                testResults[resultNum].elements.push(testCasesList[i]);
                await FireWebhookWithTestData(JSON.stringify(testResults));
            }
        }
    }

    const FireWebhookWithTestData = async (data) => {
        let buff = new Buffer.from(data);
        let base64data = buff.toString('base64');
        let payloadBody = {
            'projectId': projectId,
            'testcycle': cycleId,
            'customFieldData': customFieldData,
            'result': base64data
        };

        let bufferSize = await formatSizeUnits(Buffer.byteLength(JSON.stringify(payloadBody), 'ascii'));

        console.log('=== info: payload size is ' + bufferSize + ' MB ===');
        if (bufferSize > 50) {
            console.log('=== error: payload size is greater than 50 MB cap, exiting ===');
            return;
        }

        // establish the options for the webhook post to Pulse parser
        var opts = {
            url: pulseUri,
            json: true,
            body: payloadBody
        };

        console.log(`=== uploading results... ===`);
        request.post(opts, function (err, response, resbody) {
            if (err) {
                console.log('=== error: ' + err + ' ===');
                Promise.reject(err);
            }
            else {
                for (r = 0; r < response.body.length; r++) {
                    console.log('=== status: ' + response.body[r].status + ', execution id: ' + response.body[r].id + ' ===');
                }
                Promise.resolve("Uploaded results successfully.");
            }
        });
    }

    const pulseUri = 'https://pulse-6.qtestnet.com/webhook/f76f7da4-3d5d-4aae-9c4e-6b3605877b34';                // Pulse parser webhook endpoint
    const projectId = '112147';               // target qTest Project ID
    const cycleId = '4250599';                 // target qTest Test Cycle ID

    var result = '';
    var stats = '';

    // Edit this to reflect your results file, be certain to escape the slashes as seen below.
    let resultsPath = 'C:\\Users\\vibhu\\OneDrive - TRICENTIS\\Documents\\cucumber-report.json';//big file
    //let resultsPath = 'C:\\Users\\vibhu\\OneDrive - TRICENTIS\\Documents\\cucumber-report-1.json';//file created using data failed in execution
    //let resultsPath = 'C:\\Users\\vibhu\\OneDrive - TRICENTIS\\Documents\\cucumber-report-2.json';
    // let resultsPath = 'C:\\Users\\vibhu\\OneDrive - TRICENTIS\\Documents\\jest-report.json';

    try {
        result = fs.readFileSync(resultsPath, 'utf8');
        stats = fs.statSync(resultsPath);
        console.log('=== read results file successfully ===');
    } catch (e) {
        console.log('=== error: ', e.stack, ' ===');
    }

    try {
        let testResultObject = JSON.parse(JSON.stringify(result).toString('base64'));
        let testResults = JSON.parse(testResultObject.toString());

        if (testResults && (stats.size / (1024 * 1024)) > 30) {
            if (testResults.length > 1) {
                for (let i = 0; i < testResults.length; i++) {
                    await ProcessTestCaseFromFile(i, testResults);
                }
            }
            else {
                await ProcessTestCaseFromFile(0, testResults);
            }
        }
        else {
            FireWebhookWithTestData(result);
        }
    } catch (e) {
        console.log('=== error: ', e.stack, ' ===');
    }
};

main();
