'use strict';

var express = require('express');
var path = require('path');
var bodyParser = require("body-parser");
var app = express();

app.use(bodyParser.urlencoded({
    extended: false
}));
app.use(bodyParser.json());

var http = require('http');
var url = require('url');
var setup = require('./setup');
var fs = require("fs");

var log4js = require('log4js');
var logger = log4js.getLogger('DEPLOY');

var hfc = require('fabric-client');
var utils = require('fabric-client/lib/utils.js');
var Peer = require('fabric-client/lib/Peer.js');
var Orderer = require('fabric-client/lib/Orderer.js');
var EventHub = require('fabric-client/lib/EventHub.js');

var config = require('./config.json');
var helper = require('./helper.js');

//// Set Server Parameters ////
var host = setup.SERVER.HOST;
var port = setup.SERVER.PORT;

// Enable CORS preflight across the board.
var cors = require('cors');
app.options('*', cors());
app.use(cors());

app.use(express.static('public'));

var server = http.createServer(app).listen(port, function() {});
server.timeout = 240000;
console.log('####################### Server Up - ' + host + ':' + port + ' #######################');

logger.setLevel('DEBUG');

var client = new hfc();
var chain;
var eventhub;
var tx_id = null;

init();

function init() {
    chain = client.newChain(config.chainName);
    chain.addOrderer(new Orderer(config.orderer.orderer_url));
    eventhub = new EventHub();
    eventhub.setPeerAddr(config.events[0].event_url);
    eventhub.connect();
    for (var i = 0; i < config.peers.length; i++) {
        chain.addPeer(new Peer(config.peers[i].peer_url));
    }

    // add inital set up items.
    var itemId = 0;
    var addItemArr = function(arr) {
        console.log("Method :" + config.invokeobjects[itemId].method);
        console.log("Args :" + config.invokeobjects[itemId].args);
        var invokemethod = invoke(config.invokeobjects[itemId].method, config.invokeobjects[itemId].args);

        if (invokemethod) {
            invokemethod.then((data) => {
                if (data) {
                    var result = data.toString();
                    if (result.includes("Error:")) {
                        console.log("####################### Error - " + config.invokeobjects[itemId].method + "#######################");
                    } else {
                        console.log("####################### Success - " + config.invokeobjects[itemId].method + "#######################");
                    }
                }

                itemId++;
                if (itemId < config.invokeobjects.length) {
                    addItemArr(config.invokeobjects);
                }
            });
        }
    }
    addItemArr(config.invokeobjects);
}

app.post('/auctioncc', function(req, res) {
    if (req.body.method == "query") {
        var deferquery = query(req.body.params.ctorMsg.function, req.body.params.ctorMsg.args)

        if (deferquery) {
            deferquery.then((data) => {
                if (data) {
                    var result = data.toString();
                    if (result.includes("Error:")) {
                        result = {
                            "error": {
                                "status": "ERROR",
                                "message": data.toString()
                            }
                        }
                    } else {
                        result = {
                            "result": {
                                "status": "OK",
                                "message": data.toString()
                            }
                        }
                    }
                }
                res.send(200, result);
            });
        }
    } else if (req.body.method == "invoke") {
        var invokemethod = invoke(req.body.params.ctorMsg.function, req.body.params.ctorMsg.args)

        if (invokemethod) {
            invokemethod.then((data) => {
                if (data) {
                    var result = data.toString();
                    if (result.includes("Error:")) {
                        result = {
                            "error": {
                                "status": "ERROR",
                                "message": data.toString()
                            }
                        }
                    } else {
                        result = {
                            "result": {
                                "status": "OK",
                                "message": data.toString()
                            }
                        }
                    }
                }
                res.send(200, result);
            });
        }
    }
});

function invoke(fnname, args) {
    var deferinvoke = new Promise(function(resolve, reject) {
        hfc.newDefaultKeyValueStore({
            path: config.keyValueStore
        }).then(function(store) {
            client.setStateStore(store);
            return helper.getSubmitter(client);
        }).then(
            function(admin) {
                logger.info('Successfully obtained user to submit transaction');

                logger.info('Executing Invoke');
                tx_id = helper.getTxId();
                var nonce = utils.getNonce();
                // send proposal to endorser
                var request = {
                    chaincodeId: config.chaincodeID,
                    fcn: fnname,
                    args: args,
                    chainId: config.channelID,
                    txId: tx_id,
                    nonce: nonce
                };
                return chain.sendTransactionProposal(request);
            }
        ).then(
            function(results) {
                logger.info('Successfully obtained proposal responses from endorsers');
                return helper.processProposal(tx_id, eventhub, chain, results, 'move');
            }
        ).then(
            function(response) {
                if (response.status === 'SUCCESS') {
                    logger.info('The chaincode transaction has been successfully committed');
                    resolve('The chaincode transaction has been successfully committed');
                } else {
                    logger.info('Error: Problem commiting chaincode');
                    resolve('Error: Problem commiting chaincode');
                }
            }
        ).catch(
            function(err) {
                eventhub.disconnect();
                logger.error('Failed to invoke transaction due to error: ' + err.stack ? err.stack : err);
                reject(err);
            }
        );
    });

    return deferinvoke;
}

function query(fnname, args) {
    var deferquery = new Promise(function(resolve, reject) {
        hfc.newDefaultKeyValueStore({
            path: config.keyValueStore
        }).then(function(store) {
            client.setStateStore(store);
            return helper.getSubmitter(client);
        }).then(
            function(admin) {
                logger.info('Successfully obtained enrolled user to perform query');

                logger.info('Executing Query');
                var targets = [];
                for (var i = 0; i < config.peers.length; i++) {
                    targets.push(config.peers[i]);
                }
                //chaincode query request
                var request = {
                    targets: targets,
                    chaincodeId: config.chaincodeID,
                    chainId: config.channelID,
                    txId: utils.buildTransactionID(),
                    nonce: utils.getNonce(),
                    fcn: fnname,
                    args: args
                };
                // Query chaincode
                return chain.queryByChaincode(request);
            }
        ).then(
            function(response_payloads) {
                logger.info('Successfully performed query');
                if (response_payloads && response_payloads[0])
                    resolve(response_payloads[0].toString('utf8'));
                else
                    resolve('Error: No data found');
            }
        ).catch(
            function(err) {
                logger.error('Failed to end to end test with error:' + err.stack ? err.stack : err);
                reject(err);
            }
        );
    });

    return deferquery;
}
