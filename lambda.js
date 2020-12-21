/*
 Copyright (c) 2019 Schematic Energy, LLC
 Released under the terms of the Apache 2.0 License
*/

"use strict";
const pulumi = require("@pulumi/pulumi");
const aws = require("@pulumi/aws");
const pu = require("./context.js");
const iam = require("./iam.js");
const script = require("./script.js");
var assert = require('assert');

class LambdaInvocation extends pulumi.dynamic.Resource {

    constructor(name, props, opts) {

        const equal = function(a, b) {
            try {
                assert.deepEqual(a, b);
                return true;
            } catch (e) {
                return false;
            }
        };

        const exec = async function({timeout, region, name, input, qualifier}) {
            let cmd = ["aws lambda invoke --function-name", name, "--payload", "'", JSON.stringify(input),  "'"];
            if(qualifier) {
                cmd = cmd.concat(["--qualifier", qualifier]);
            }
            cmd = cmd.concat([ "lambda-out.tmp && cat lambda-out.tmp"]);

            let args = {timeout, region, cmd};
            return await script.execAwsCommand(args);
        };

        const provider = {

            async create(inputs) {
                let result = await exec(inputs);
                return { id: name, outs: {result: result}};
            },

            async update(id, olds, news) {
                if(equal(news.name, olds.name) &&
                   equal(news.input, olds.input) &&
                   equal(news.qualifier, olds.qualifier)) {
                    return { id: id, outs: {}};
                } else {
                    let result = await exec(news);
                    return { id: id, outs: {result: result}};
                }
            }

        };

        props.result = undefined;
        super(provider, name, props, opts);
    }
}

exports.LambdaInvocation = LambdaInvocation;
//
