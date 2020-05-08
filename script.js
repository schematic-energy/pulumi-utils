/*
 Copyright (c) 2019 Schematic Energy, LLC
 Released under the terms of the Apache 2.0 License
*/

const pulumi = require("@pulumi/pulumi");
const child_process = require('child_process');
const equal = require('deep-equal');

const execScript = async function(script) {
    let promise = new Promise(resolve => {
        child_process.exec(script, (error, stdout, stderr) => {
            resolve( { error: error,
                       stdout: stdout,
                       stderr: stderr } );
        });
    });
    var result = await promise;
    if (result.error) {
        console.log("Script returned non-zero exit code");
        console.log("stdout:\n\n" + result.stdout + "\n\n");
        console.log("stderr:\n\n" + result.stderr + "\n\n");
        throw new Error("Script returned non-zero exit code");
    }
    return result;
};

exports.execScript = execScript;

class ScriptResource extends pulumi.dynamic.Resource {

    constructor(name, props, opts) {

        const scriptProvider = {

            async create(inputs) {
                let result = await execScript(inputs.script);
                return { id: name, outs: {result: result.stdout}};
            },

            async update(id, olds, news) {
                if(!equal(news.script, olds.script)) {
                    let result = await execScript(news.script);
                    return { id: id, outs: {result: result.stdout}};
                } else {
                    return { id: id, outs: {}};
                }
            }
        };
        props.result = undefined;
        super(scriptProvider, name, props, opts);
    }
}

exports.ScriptResource = ScriptResource;

const execAwsCommand = async function({timeout, region, cmd}) {

    let script = `export AWS_DEFAULT_REGION=${region}`;
    if (typeof cmd === 'string') {
        script = script + "\n" + cmd;
    } else {
        script = script + "\n" + cmd.join(' ');
    }

    let now = function() { return new Date().getTime(); };

    let start = now();
    let deadline = start + (timeout * 1000);

    let result;

    while(!result) {

        if(now() > deadline) {
            throw new Error("Timeout on AWS CLI command retries exceeded");
        }

        let promise = new Promise(resolve => {
            child_process.exec(script, (error, stdout, stderr) => {
                resolve( { error: error,
                           stdout: stdout,
                           stderr: stderr } );
            });
        });
        var cmdResult = await promise;

        if (cmdResult.error) {
            console.log("AWS CLI command returned non-zero exit code");
            console.log("stdout:\n\n" + cmdResult.stdout + "\n\n");
            console.log("stderr:\n\n" + cmdResult.stderr + "\n\n");
            throw new Error("Script returned non-zero exit code");
        }

        if( ! /^\s*$/.test(cmdResult.stdout)) {
            result = cmdResult.stdout.trim();
        }
    }

    return result;
};

/**

Wraps an AWS CLI command in a Pulumi resource. Upon creation and
update, the command will be retried until it either returns a
non-empty string, or fails with a non-zero result code. If the
timeout (in seconds) is exceeded, an error is thrown.

*/

class AwsCommand extends pulumi.dynamic.Resource {

    constructor(name, props, opts) {

        const cmdProvider = {

            async create(inputs) {
                let result = await execAwsCommand(inputs);
                return { id: name, outs: {result: result}};
            },

            async update(id, olds, news) {
                if(!equal(news.cmd, olds.cmd)) {
                    let result = await execAwsCommand(news);
                    return { id: id, outs: {result: result}};
                } else {
                    return { id: id, outs: {}};
                }
            }
        };
        props.result = undefined;
        super(cmdProvider, name, props, opts);
    }
}

exports.AwsCommand = AwsCommand;


//end
