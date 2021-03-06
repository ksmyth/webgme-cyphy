//noinspection JSLint
/**
* Generated by PluginGenerator from webgme on Thu May 22 2014 22:27:57 GMT-0500 (Central Daylight Time).
*/

define(['plugin/PluginConfig',
        'plugin/PluginBase',
        'plugin/TestBenchRunner/TestBenchRunner/meta',
        'plugin/TestBenchRunner/TestBenchRunner/Templates/Templates',
        'plugin/AdmExporter/AdmExporter/AdmExporter',
        'plugin/AdmExporter/AtmExporter/AtmExporter',
        'xmljsonconverter',
        'executor/ExecutorClient',
        'ejs'
    ],function (PluginConfig, PluginBase, MetaTypes, TEMPLATES, AdmExporter, AtmExporter, Converter, ExecutorClient, ejs) {
    'use strict';
//<editor-fold desc="============================ Class Definition ================================">
    /**
    * Initializes a new instance of TestBenchRunner.
    * @class
    * @augments {PluginBase}
    * @classdesc This class represents the plugin TestBenchRunner.
    * @constructor
    */
    var TestBenchRunner = function () {
        // Call base class' constructor.
        PluginBase.call(this);
        this.meta = MetaTypes;
        this.referencedDesign = null;
        this.saveToModel = false;
        this.resultsData = {};
        // Execution frame-work.
        this.runExecution = false;
        this.run_exec_cmd = null;
        this.exec_py = null;
        this.executorClient = null;
        // AVM design format
        this.designAcmFiles = null;
        this.admData = null;
        this.admString = null;

        this.admExporter = null;
        this.atmExporter = null;
    };

    // Prototypal inheritance from PluginBase.
    TestBenchRunner.prototype = Object.create(PluginBase.prototype);
    TestBenchRunner.prototype.constructor = TestBenchRunner;

    /**
    * Gets the name of the TestBenchRunner.
    * @returns {string} The name of the plugin.
    * @public
    */
    TestBenchRunner.prototype.getName = function () {
        return "Test bench runner";
    };

    /**
    * Gets the semantic version (semver.org) of the TestBenchRunner.
    * @returns {string} The version of the plugin.
    * @public
    */
    TestBenchRunner.prototype.getVersion = function () {
        return "0.1.0";
    };

    /**
    * Gets the description of the TestBenchRunner.
    * @returns {string} The description of the plugin.
    * @public
    */
    TestBenchRunner.prototype.getDescription = function () {
        return "Exports the design and run the test-bench from where it is called.";
    };

    /**
    * Gets the configuration structure for the TestBenchRunner.
    * The ConfigurationStructure defines the configuration for the plugin
    * and will be used to populate the GUI when invoking the plugin from webGME.
    * @returns {object} The version of the plugin.
    * @public
    */
    TestBenchRunner.prototype.getConfigStructure = function () {
        return [
            {
                'name': 'run',
                'displayName': 'Run test-bench',
                'description': 'Will start a job and run the test-bench.',
                'value': false,
                'valueType': 'boolean',
                'readOnly': false
            },
            {
                'name': 'save',
                'displayName': 'Save results',
                'description': 'Will save the results back to the model (only applicable when run is selected).',
                'value': false,
                'valueType': 'boolean',
                'readOnly': false
            },
            {
                'name': 'configurationPath',
                'displayName': 'DesertConfigurationID',
                'description': 'ID of DesertConfiguration object inside referenced TopLevelSystemUnderTest.',
                'value': '',
                'valueType': 'string',
                'readOnly': false
            }
        ];
    };
//</editor-fold>

    /**
    * Main function for the plugin to execute. This will perform the execution.
    * Notes:
    * - Always log with the provided logger.[error,warning,info,debug].
    * - Do NOT put any user interaction logic UI, etc. inside this method.
    * - callback always has to be called even if error happened.
    *
    * @param {function(string, plugin.PluginResult)} callback - the result callback
    */
    TestBenchRunner.prototype.main = function (callback) {
        // Use self to access core, project, result, logger etc from PluginBase.
        // These are all instantiated at this point.
        var self = this,
            currentConfig = self.getCurrentConfig();

        if (!self.activeNode) {
            self.createMessage(null, 'Active node is not present! This happens sometimes... Loading another model ' +
                'and trying again will solve it most of times.', 'error');
            callback('Active node is not present!', self.result);
            return;
        }
        if (self.isMetaTypeOf(self.activeNode, self.META.AVMTestBenchModel) === false) {
            self.createMessage(null, 'This plugin must be called from an AVMTestBenchModel.', 'error');
            callback(null, self.result);
            return;
        }
        self.updateMETA(self.meta);
        self.runExecution = currentConfig.run;
        self.saveToModel = currentConfig.save;
        self.cfgPath = currentConfig.configurationPath;

        self.getTestBenchInfo(self.activeNode, function (err, testBenchInfo) {
            if (err) {
                self.logger.error('getTestBenchInfo returned with error: ' + err.toString());
                self.createMessage(self.activeNode, 'Something went wrong when exploring the test-bench.', 'error');
                callback(null, self.result);
                return;
            }
            self.getAdmAndAcms(self.referencedDesign, [testBenchInfo], function (err) {
                if (err) {
                    self.logger.error(err);
                    self.createMessage(self.referencedDesign, 'Something went wrong when exploring the referenced design.', 'error');
                    callback(null, self.result);
                    return;
                }
                self.generateExecutionFiles(testBenchInfo, function (err, artifact) {
                    if (err) {
                        callback('Could generateExecutionFiles : err' + err.toString(), self.result);
                        return;
                    }
                    artifact.save(function (err, hash) {
                        if (err) {
                            callback('Could not save artifact : err' + err.toString(), self.result);
                            return;
                        }
                        self.result.addArtifact(hash);
                        if (self.runExecution) {
                            self.executeJob(hash, testBenchInfo, function (err, success) {
                                if (err) {
                                    self.logger.error(err);
                                    callback(err, self.result);
                                    return;
                                }
                                self.result.setSuccess(success);
                                if (self.saveToModel && self.cfgPath) {
                                    self.loadLatestRoot(function (err, latestRootNode) {
                                        if (err) {
                                            self.logger.error(err);
                                            callback(err, self.result);
                                            return;
                                        }
                                        self.core.loadByPath(latestRootNode, self.resultsData.configurationPath, function (err, cfgNode) {
                                            var resultNode;
                                            if (err) {
                                                self.logger.error(err);
                                                callback(err, self.result);
                                                return;
                                            }
                                            self.core.loadByPath(latestRootNode, self.resultsData.resultMetaNodePath, function (err, resMetaNode) {
                                                if (err) {
                                                    self.logger.error(err);
                                                    callback(err, self.result);
                                                    return;
                                                }

                                                self.core.loadByPath(latestRootNode, self.resultsData.executedTestBenchPath, function (err, tbNode) {
                                                    if (err) {
                                                        self.logger.error(err);
                                                        callback(err, self.result);
                                                        return;
                                                    }
                                                    resultNode = self.core.createNode({parent: cfgNode, base: resMetaNode});
                                                    self.core.setAttribute(resultNode, 'name', new Date().toString());
                                                    self.core.setAttribute(resultNode, 'CfgAdm', self.resultsData.cfgAdm);
                                                    self.core.setPointer(resultNode, 'ExecutedTestBench', tbNode);
                                                    self.core.setAttribute(resultNode, 'TestBenchManifest', 'See Artifacts...');
                                                    self.core.setAttribute(resultNode, 'Artifacts', self.resultsData.testBenchManifest);
                                                    self.logger.info('Execution succeeded for test-bench "' + testBenchInfo.name + '".');
                                                    self.save('Test-bench "' + testBenchInfo.name + '" results was updated after execution.', function (err) {
                                                        if (err) {
                                                            self.result.setSuccess(false);
                                                            callback(err, self.result);
                                                        }
                                                        self.createMessage(resultNode, 'Results saved to result node.', 'info');
                                                        callback(null, self.result);
                                                    });
                                                });
                                            });
                                        });
                                    });
                                } else if (self.saveToModel && success) {
                                    self.save('Test-bench "' + testBenchInfo.name + '" results was updated after execution.', function (err) {
                                        if (err) {
                                            self.result.setSuccess(false);
                                            callback(err, self.result);
                                        }
                                        self.createMessage(null, 'Results saved to test-bench node.', 'info');
                                        callback(null, self.result);
                                    });
                                } else {
                                    callback(null, self.result);
                                }
                            });
                        } else {
                            self.result.setSuccess(true);
                            callback(null, self.result);
                        }
                    });
                });
            });
        });
    };

    TestBenchRunner.prototype.getTestBenchInfo = function (testBenchNode, callback) {
        var self = this,
            testBenchInfo = {};
        testBenchInfo.name = self.core.getAttribute(testBenchNode, 'name');
        testBenchInfo.path = self.core.getAttribute(testBenchNode, 'ID');
        testBenchInfo.testBenchFilesHash = self.core.getAttribute(testBenchNode, 'TestBenchFiles');
        testBenchInfo.node = testBenchNode;
        if (!testBenchInfo.path) {
            self.createMessage(testBenchNode, 'There is no "ID" provided for the test-bench. It must be a path' +
                ' in the project-tree of the xme in asset "TestBenchFiles", e.g. /TestBenches/Dynamics/MyTestBench', 'error');
            callback('TestBench ID not provided.');
            return;
        }
        self.logger.info('Getting data for test-bench "' + testBenchInfo.name + '".');
        self.initializeAtmExporter();
        self.atmExporter.getTlsutInterface(testBenchNode, function (err, tlsut) {
            if (err) {
                self.createMessage(testBenchNode, 'Could not obtain Top Level System Under test interface.', 'error');
                callback('Something went wrong when getting tlsut interface err: ' + err);
                return;
            }
            testBenchInfo.tlsut = tlsut;

            // For single test-benches check the reference for the test-bench and its parent folder.
            if (self.core.hasPointer(testBenchNode, 'TopLevelSystemUnderTest')) {
                self.logger.info('Test-bench has TopLevelSystemUnderTest ref set.');
                self.core.loadPointer(testBenchNode, 'TopLevelSystemUnderTest', function (err, design) {
                    if (err) {
                        self.logger.error('loading TLSUT failed with err: ' + err.toString());
                        callback(err);
                        return;
                    }
                    self.referencedDesign = design;
                    callback(null, testBenchInfo);
                });
            } else {
                self.createMessage(testBenchNode, 'No TopLevelSystemUnderTest reference set for test-bench.', 'error');
                callback('Found no reference to TLSUT.');
            }
        });
    };

    TestBenchRunner.prototype.getAdmAndAcms = function (designNode, testBenchInfos, callback) {
        var self = this;
        self.checkDesignAgainstTLSUTs(designNode, testBenchInfos, function (err, result) {
            if (err) {
                callback(err);
                return;
            }
            if (result !== true) {
                self.createMessage(designNode, 'Design did not match TopLevelSystemUnderTests!', 'error');
                callback('Design did not match TopLevelSystemUnderTests!');
                return;
            }
            self.initializeAdmExporter();
            self.admExporter.rootPath = self.core.getPath(designNode);
            self.admExporter.setupDesertCfg(self.cfgPath, function (err) {
                if (err) {
                    callback('Failed setting up desertConfigurations, err: ' + err);
                    return;
                }
                if (self.admExporter.selectedAlternatives) {
                    self.logger.info('Running on single configuration');
                    self.logger.info(JSON.stringify(self.admExporter.selectedAlternatives, null));
                }
                self.admExporter.exploreDesign(designNode, true, function (err) {
                    if (err) {
                        callback('AdmExporter.exploreDesign failed with error: ' + err);
                        return;
                    }
                    self.admData = self.admExporter.admData;
                    self.designAcmFiles = self.admExporter.acmFiles;
                    callback(null);
                });
            });
        });
    };

    TestBenchRunner.prototype.checkDesignAgainstTLSUTs = function (designNode, testBenchInfos, callback) {
        var self = this,
            k,
            key,
            mergedProperties = {},
            mergedConnectors = {};
        for (k = 0; k < testBenchInfos.length; k += 1) {
            for (key in testBenchInfos[k].tlsut.properties) {
                if (testBenchInfos[k].tlsut.properties.hasOwnProperty(key)) {
                    mergedProperties[key] = testBenchInfos[k].tlsut.properties[key];
                }
            }
            for (key in testBenchInfos[k].tlsut.connectors) {
                if (testBenchInfos[k].tlsut.connectors.hasOwnProperty(key)) {
                    mergedConnectors[key] = testBenchInfos[k].tlsut.connectors[key];
                }
            }
        }

        self.core.loadChildren(designNode, function (err, children) {
            var counter, i,
                error = '',
                metaTypeName,
                childName,
                counterCallback;
            if (err) {
                callback('loadChildren failed for tlsut with err:' + err.toString());
                return;
            }
            counter = children.length;
            counterCallback = function (err) {
                var innerKey,
                    isValid;

                error = err ? error + err : error;
                counter -= 1;
                if (counter <= 0) {
                    isValid = true;
                    for (innerKey in mergedProperties) {
                        if (mergedProperties.hasOwnProperty(innerKey) && mergedProperties[innerKey] !== true) {
                            //isValid = false;
                            self.createMessage(mergedProperties[innerKey], 'Design does not have property "' + innerKey
                                + '". Property checks are currently ignored.', 'warning');
                        }
                    }
                    for (innerKey in mergedConnectors) {
                        if (mergedConnectors.hasOwnProperty(innerKey) && mergedConnectors[innerKey] !== true) {
                            isValid = false;
                            self.createMessage(mergedConnectors[innerKey], 'Design does not have connector "' +
                                innerKey + '".', 'error');
                        }
                    }
                    callback(error, isValid);
                }
            };

            if (children.length === 0) {
                counterCallback(null);
            }

            for (i = 0; i < children.length; i += 1) {
                metaTypeName = self.core.getAttribute(self.getMetaType(children[i]), 'name');
                childName = self.core.getAttribute(children[i], 'name');
                if (metaTypeName === 'Property') {
                    if (mergedProperties[childName] !== undefined) {
                        mergedProperties[childName] = true;
                    }
                    counterCallback(null);
                } else if (metaTypeName === 'Connector') {
                    if (mergedConnectors[childName] !== undefined) {
                        mergedConnectors[childName] = true;
                    }
                    counterCallback(null);
                } else {
                    counterCallback(null);
                }
            }
        });
    };

    TestBenchRunner.prototype.initializeAdmExporter = function () {
        var self = this;
        if (self.admExporter === null) {
            self.admExporter = new AdmExporter();
            self.admExporter.meta = self.meta;
            self.admExporter.META = self.META;
            self.admExporter.core = self.core;
            self.admExporter.logger = self.logger;
            self.admExporter.result = self.result;
            self.admExporter.rootNode = self.rootNode;
            self.logger.info('AdmExporter had not been initialized - created a new instance.');
        } else {
            self.admExporter.acmFiles = {};
            self.admExporter.gatheredAcms = {};
            self.admExporter.rootPath = null;
            self.admExporter.includeAcms = true;
            self.logger.info('AdmExporter had already been initialized - reset acmFiles, gatheredAcms and rootPath.');
        }
    };

    TestBenchRunner.prototype.initializeAtmExporter = function () {
        var self = this;
        self.atmExporter = new AtmExporter();
        self.atmExporter.meta = self.meta;
        self.atmExporter.META = self.META;
        self.atmExporter.core = self.core;
        self.atmExporter.logger = self.logger;
        self.atmExporter.result = self.result;
        self.atmExporter.atmData = null;
        self.logger.info('AtmExporter initialized.');
    };

    TestBenchRunner.prototype.generateExecutionFiles = function (testBenchInfo, callback) {
        var self = this,
            artifact,
            executorConfig,
            jsonToXml,
            testbenchConfig,
            filesToAdd = {};
        self.logger.info('Generating execution files.');
        if (!self.admString) {
            // Only convert the common ejs files once.
            self.logger.info('This was first generation of common filesToAdd.');
            jsonToXml = new Converter.Json2xml();
            self.admString = jsonToXml.convertToString({Design: self.admData});
            self.run_exec_cmd = ejs.render(TEMPLATES['run_execution.cmd.ejs']);
            self.exec_py = ejs.render(TEMPLATES['execute.py.ejs']);
        }
        filesToAdd[self.admData['@Name'] + '.adm'] = self.admString;
        filesToAdd['run_execution.cmd'] = self.run_exec_cmd;
        filesToAdd['execute.py'] = self.exec_py;
        executorConfig = JSON.stringify({
            cmd: 'run_execution.cmd',
            resultArtifacts: [
                {
                    name: 'dashboard',
                    resultPatterns: ['dashboard/**', 'designs/**', 'design-space/**', 'requirements/**',
                        'test-benches/**', 'results/*/testbench_manifest.json', 'results/results.metaresults.json',
                        'manifest.project.json', 'index.html', '*.svg']
                },
                {
                    name: 'logs',
                    resultPatterns: [ 'log/**', '_FAILED.txt']
                },
                {
                    name: 'all',
                    resultPatterns: []
                },
                {
                    name: 'testBenchManifest',
                    resultPatterns: ['results/*/testbench_manifest.json']
                },
                {
                    name: 'cfgAdm',
                    resultPatterns: ['designs/**']
                }
            ]

        }, null, 4);
        filesToAdd['executor_config.json'] = executorConfig;
        testbenchConfig = JSON.stringify({ name: testBenchInfo.name, path: testBenchInfo.path }, null, 4);
        filesToAdd['testbench_config.json'] = testbenchConfig;
        self.logger.info('TestBenchConfig : ' + testbenchConfig);
        self.logger.info('ExecutorConfig  : ' + executorConfig);

        artifact = self.blobClient.createArtifact(testBenchInfo.name);
        artifact.addMetadataHash('tbAsset.zip', testBenchInfo.testBenchFilesHash, function (err, hash) {
            if (err) {
                callback('Could not add tbAsset.zip from test-bench : err' + err.toString());
                return;
            }
            artifact.addObjectHashes(self.designAcmFiles, function (err, hashes) {
                if (err) {
                    callback('Could not add acm files : err' + err.toString());
                    return;
                }
                artifact.addFiles(filesToAdd, function (err, hashes) {
                    if (err) {
                        callback('Could not add script files : err' + err.toString());
                        return;
                    }
                    callback(null, artifact);
                });
            });
        });
    };

    TestBenchRunner.prototype.executeJob = function (artifactHash, testBenchInfo, callback) {
        var self = this;

        if (!self.executorClient) {
            self.logger.info('First execution, creating executor client..');
            self.executorClient = new ExecutorClient();
        }
        self.executorClient.createJob(artifactHash, function (err, jobInfo) {
            var intervalID,
                atSucceedJob;
            if (err) {
                callback('Creating job failed for "' + testBenchInfo.name + '", err: '  + err.toString(), false);
                return;
            }
            self.logger.info('Initial job-info:' + JSON.stringify(jobInfo, null, 4));

            atSucceedJob = function (jInfo) {
                var key;
                self.logger.info('Execution for test-bench "' + testBenchInfo.name + '"  succeeded.');
                self.logger.info('Its final JobInfo looks like : ' + JSON.stringify(jInfo, null, 4));
                for (key in jInfo.resultHashes) {
                    if (jInfo.resultHashes.hasOwnProperty(key)) {
                        self.result.addArtifact(jInfo.resultHashes[key]);
                    }
                }
                self.blobClient.getMetadata(jInfo.resultHashes.logs, function (err, metadata) {
                    if (err) {
                        callback('Could not get metadata for result. Err: ' + err, false);
                        return;
                    }
                    if (metadata.content.hasOwnProperty('_FAILED.txt')) {
                        self.createMessage(testBenchInfo.node, 'Execution had errors - download execution_results for "' +
                            testBenchInfo.name + '" and read _FAILED.txt', 'error');
                        callback(null, false);
                        return;
                    }
                    self.core.setAttribute(testBenchInfo.node, 'Results', jInfo.resultHashes.dashboard);
                    // Save data that is needed for storing data result node.
                    self.resultsData = {
                        cfgAdm: jInfo.resultHashes.cfgAdm,
                        executedTestBenchPath: self.core.getPath(testBenchInfo.node),
                        testBenchManifest: jInfo.resultHashes.testBenchManifest,
                        resultMetaNodePath: self.core.getPath(self.meta.Result),
                        configurationPath: self.cfgPath
                    };
                    self.logger.info('Execution succeeded for test-bench "' + testBenchInfo.name + '".');
                    callback(null, true);
                });
            };

            //noinspection JSLint
            intervalID = setInterval(function () {
                // Get the job-info at intervals and check for a non-CREATED status.
                self.executorClient.getInfo(artifactHash, function (err, jInfo) {
                    self.logger.info(JSON.stringify(jInfo, null, 4));
                    if (jInfo.status === 'CREATED' || jInfo.status === 'RUNNING') {
                        // The job is still running..
                        return;
                    }
                    //noinspection JSLint
                    clearInterval(intervalID);
                    if (jInfo.status === 'SUCCESS') {
                        atSucceedJob(jInfo);
                    } else {
                        self.result.addArtifact(jInfo.resultHashes[testBenchInfo.name + '_logs']);
                        self.result.addArtifact(jInfo.resultHashes[testBenchInfo.name + '_all']);
                        callback('Job execution failed', false);
                    }
                });
            }, 2000);
        });
    };

    TestBenchRunner.prototype.endsWith = function (str, ending) {
        var lastIndex = str.lastIndexOf(ending);
        return (lastIndex !== -1) && (lastIndex + ending.length === str.length);
    };

    TestBenchRunner.prototype.loadLatestRoot = function (callback) {
        var self = this;
        if (self.branchName) {
            self.project.getBranchNames(function (err, branchNames) {
                var branchHash;
                if (err) {
                    callback(err);
                    return;
                }
                if (branchNames.hasOwnProperty(self.branchName)) {
                    branchHash = branchNames[self.branchName];
                    if (branchHash === self.branchHash) {
                        // The branch does not have any new commits - return with original rootNode.
                        self.logger.info('Branch did not change during execution..');
                        callback(null, self.rootNode);
                    } else {
                        // There were commits to the branch since the plugin started.
                        self.logger.info('Loading latest commit, from ' + self.branchHash);
                        self.project.getBranchHash(self.branchName, self.branchHash, function (err, latestHash) {
                            if (err) {
                                self.logger.error(err);
                                callback(err);
                                return;
                            }
                            self.logger.info('Obtained latest commit hash for "' + self.branchName + '": ' + latestHash +
                                '. Attempting to load commit..');
                            self.project.loadObject(latestHash, function (err, commitObj) {
                                if (err) {
                                    callback(err);
                                    return;
                                }
                                self.core.loadRoot(commitObj.root, function (err, latestRoot) {
                                    if (err) {
                                        callback(err);
                                        return;
                                    }
                                    self.branchHash = branchHash;
                                    self.rootNode = latestRoot;
                                    callback(null, latestRoot);
                                });
                            });
                        });
                    }
                } else {
                    callback(null, self.rootNode);
                }
            });
        } else {
            callback(null, self.rootNode);
        }
    };

    return TestBenchRunner;
});