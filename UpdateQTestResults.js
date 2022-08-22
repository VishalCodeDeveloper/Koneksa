/*
 * trigger name: UpdateQTestWithResults
 * call source: any and all Result Parser rules via emitEvent()
 * payload example:
        {
          "projectId": "5",
          "testcycle": "555555",
          "logs": [
            {
              "status": "passed",
              "name": "Test 1 Name",
              "attachments": [],
              "exe_start_date": "2020-10-30T14:56:22.357Z",
              "exe_end_date": "2020-10-30T14:56:22.357Z",
              "automation_content": "uniquely identfied string",
              "module_names": [
                "TEST CYCLE FOLDER NAME"
              ],
              "test_step_logs": [
                {
                  "description": "Step 1 description",
                  "expected_result": "Step 1 expected",
                  "actual_result": "Step 1 result",
                  "order": 1,
                  "status": "passed"
                },
                {
                  "description": "Step 2 description",
                  "expected_result": "Step 2 expected",
                  "actual_result": "Step 2 result",
                  "order": 2,
                  "status": "passed"
                },
                {
                  "description": "Step 3 description",
                  "expected_result": "Step 3 expected",
                  "actual_result": "Step 3 result",
                  "order": 3,
                  "status": "passed"
                }
                }
              ]
            }
          ]
        }
 * constants:
 *  QTEST_TOKEN: the qTest user bearer token from the API/SDK section of the 'Resources' area
        Ex. 02e74731-2f6e-4b95-b928-1596a68881e2
 *  ManagerURL: the base qTest Manager domain with no protocol information, https is expected by the script
        Ex. demo.qtestnet.com
 * outputs: standardized construct to be consumed by the qTest auto-test-logs API
 * external documentation: https://api.qasymphony.com/#/test-log/submitAutomationTestLogs2
 * Pulse events called: ChatOpsEvent
 */

const request = require('request');
const { Webhooks } = require('@qasymphony/pulse-sdk');
const ScenarioSdk = require('@qasymphony/scenario-sdk');

const Features = {
    getIssueLinkByFeatureName(qtestToken, scenarioProjectId, name) {
        return new ScenarioSdk.Features({ qtestToken, scenarioProjectId }).getFeatures(`"${name}"`);
    }
};

exports.handler = function ({ event: body, constants, triggers }, context, callback) {
    function emitEvent(name, payload) {
        let t = triggers.find(t => t.name === name);
        return t && new Webhooks().invoke(t, payload);
    }

    var payload = body;

    var testLogs = payload.logs;
    var cycleId = payload.testcycle;
    var projectId = payload.projectId;
    var properties = payload.properties;
    var searchQuery = payload.searchQuery;

    var queueStatus = 'IN_WAITING'; // IN_WAITING, IN_PROCESSING, FAILED, PENDING and SUCCESS
    var queueId = 0;

    var standardHeaders = {
        'Content-Type': 'application/json',
        'Authorization': `bearer ${constants.QTEST_TOKEN}`
    }

    function createLogsAndTCs() {
        var opts = {
            url: 'https://' + constants.ManagerURL + '/api/v3/projects/' + projectId + '/auto-test-logs?type=automation',
            json: true,
            headers: standardHeaders,
            body: {
                test_cycle: cycleId,
                test_logs: testLogs
            }
        };

        return request.post(opts, function (err, response, resbody) {

            if (err) {
                Promise.reject(err);
                console.log(err);
            }
            else {
                if (response.body.type == 'AUTOMATION_TEST_LOG') {
                    queueId = response.body.id;
                    Promise.resolve('Results queued successfully.');
                    console.log('[INFO]: Results queued successfully for id: ' + resbody.id);
                    checkQueueStatus(queueId, searchQuery);
                }
                else {
                    Promise.reject('[ERROR]: Unable to upload test results.  See logs for details.');
                    console.log('[ERROR]: ' + JSON.stringify(resbody));
                }
            }
        });
    };

    function UpdateTestCaseProperties(testCase) {
        var opts = {
            url: 'https://' + constants.ManagerURL + '/api/v3/projects/' + projectId + '/test-cases/' + testCase.id,
            json: true,
            headers: standardHeaders,
            body: {
                id: testCase.id,
                properties: properties
            }
        };

        return request.put(opts, function (err, response, resbody) {

            if (err) {
                Promise.reject(err);
                console.log(err);
            }
            else {
                return response.body;
            }
        });
    };

    const searchestCasesWithName = async (searchQuery) => {
        return await new Promise(async (resolve, reject) => {
            var options = {
                url: 'https://' + constants.ManagerURL + '/api/v3/projects/' + projectId + '/search',
                json: true,
                'headers': standardHeaders,
                body: {
                    object_type: "test-cases",
                    query: searchQuery
                }
            };

            request.post(options, function (error, response) {
                if (error) {
                    return reject(error);
                } else {
                    return resolve(response.body);
                }
            });
        });
    };

    async function checkQueueStatus(id, searchQuery) {
        var opts = {
            url: 'https://' + constants.ManagerURL + '/api/v3/projects/queue-processing/' + id,
            json: true,
            headers: standardHeaders
        };

        var queueCounter = 0;
        const queueProcessing = ['IN_WAITING', 'IN_PROCESSING', 'PENDING'];

        await sleep(5000);

        while (queueProcessing.includes(queueStatus)) {

            await request(opts, async function (err, response, resbody) {
                if (err) {
                    Promise.reject(err);
                    console.log(err);
                    return;
                }
                else {
                    queueStatus = resbody.state;
                    Promise.resolve('Queue checked successfully.');
                    console.log('[INFO]: Queue checked for id: ' + id + ', status is now: ' + queueStatus);
                    if (queueStatus == 'FAILED') {
                        console.log('[ERROR]: ' + resbody.content);
                    }
                    else if (queueStatus == 'SUCCESS') {
                        try {
                            if (properties !== undefined && properties.length > 0) {
                                await searchestCasesWithName(searchQuery).then((searchResponse) => {
                                    searchResponse.items.forEach(element => {
                                        try {
                                            UpdateTestCaseProperties(element);
                                        }
                                        catch (updateTCError) {
                                            console.log("Error while updating Test case properties : " + updateTCError + "\n\n Test Case Data : " + element);
                                        }
                                    });
                                }).catch((error) => {
                                    console.log(error);
                                });
                            }
                        }
                        catch (err) {
                            console.log("Error in allowed value call : " + err);
                        }
                    }
                }
            });

            queueCounter++;

            if (queueCounter > 30) {
                console.log('[WARNING]: Queue id: ' + id + ' is still in processing after 60 seconds, likely caused by heavy traffic.')
                return;
            } else {
                await sleep(5000);
            }
        }
        return;
    };

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    createLogsAndTCs();
}
