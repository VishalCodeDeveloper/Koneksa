const cp = require('child_process');
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
    req('request').debug = true;

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
            "Priority": "Urgent",
            "Assigned To": "Varsha Dahatonde" //user list in run is sigle select field
        }
    }

    const pulseUri = 'https://pulse-6.qtestnet.com/webhook/57512e2b-b3f5-4c0c-a30a-aec0ca008c58';                // Pulse parser webhook endpoint
    const projectId = '112147';
    const cycleId = '4250599';

    var result = '';

    // Edit this to reflect your results file, be certain to escape the slashes as seen below.
    let resultsPath = 'C:\\Users\\vibhu\\OneDrive - TRICENTIS\\Documents\\jest-report.json';

    try {
        result = fs.readFileSync(resultsPath, 'utf8');
        console.log('=== read results file successfully ===');
    } catch (e) {
        console.log('=== error: ', e.stack, ' ===');
    }

    let buff = new Buffer.from(result);
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
        process.exit();
    }

    // establish the options for the webhook post to Pulse parser
    var opts = {
        url: pulseUri,
        json: true,
        body: payloadBody
    };

    console.log(`=== uploading results... ===`)
    return request.post(opts, function (err, response, resbody) {
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
};

main();
