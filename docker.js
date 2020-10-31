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

/** Wrapper for more terse ECR task definitions */
exports.task = function(ctx, name, {role,
                                    policyStatements,
                                    image,
                                    commands,
                                    logGroup,
                                    cpu,
                                    env,
                                    portMappings,
                                    skipGroup,
                                    mountPoints,
                                    volumes,
                                    memory}) {
    if (!skipGroup) {
        ctx = ctx.withGroup(`task:${name}`);
    }

    let displayName = `${name}-${ctx.env}`;


    if (!logGroup){
        logGroup = ctx.r(aws.cloudwatch.LogGroup, name, {
            name: `/${ctx.orgName}/${ctx.env}/${name}`
        });
    };

    if (!volumes) {
        volumes = [];
    }

    let containerDef = {
        name: displayName,
        image: image.imageName || image,
        essential: true,
        portMappings: portMappings,
        logConfiguration: {
            logDriver: "awslogs",
            options: {
                "awslogs-group": logGroup.name,
                "awslogs-region": pu.defer(r => r.name, aws.getRegion()),
                "awslogs-stream-prefix": "ecs-task"
            }
        }};

    if( commands && commands.length > 0) {
        containerDef.entryPoint = ["sh", "-c", pu.defer(c => c.join(" && "), commands)];
    }

    if (mountPoints && mountPoints.length > 0 ) {
        containerDef.mountPoints = mountPoints;
    }

    if( env && Object.keys(env).length > 0 ) {
        containerDef.environment = Object.keys(env).map(k => {
            return {Name: k, Value: env[k]};
        });
    }

    if (!role) {

        policyStatements.push(iam.policyStmt(["*"],
                                             ["ecr:GetAuthorizationToken",
                                              "ecr:BatchCheckLayerAvailability",
                                              "ecr:GetDownloadUrlForLayer",
                                              "ecr:GetRepositoryPolicy",
                                              "ecr:DescribeRepositories",
                                              "ecr:ListImages",
                                              "ecr:DescribeImages",
                                              "ecr:BatchGetImage"]));

        policyStatements.push(iam.policyStmt([logGroup.arn],
                                             ["logs:CreateLogStream",
                                              "logs:PutLogEvents"]));

        role = iam.role(ctx, name, {
            services: ["ecs-tasks"],
            statements: policyStatements
        }).role.arn;
    };

    return ctx.r(aws.ecs.TaskDefinition,
                 name,
                 {family: displayName,
                  requiresCompatibilities: ["FARGATE"],
                  networkMode: "awsvpc",
                  cpu: cpu || 256,
                  memory: memory || 512,
                  taskRoleArn: role,
                  executionRoleArn: role,
                  containerDefinitions: pu.stringify([containerDef])
                 });
};

/** Create a docker task that runs on deployment,
 then waits for the task to complete before
 `pulumi up` terminates */
exports.deploymentTask = function(ctx, name, opts){

    ctx = ctx.withGroup(`install-task:${name}`);
    opts.skipGroup = true;

    let task = exports.task(ctx, name, opts);

    let region = pulumi.output(aws.getRegion({})).name;

    if (!opts.securityGroup){
        opts.securityGroup = ctx.r(aws.ec2.SecurityGroup, name, {
            vpcId: ctx.network.vpcId,
            tags: {Name: `${name} (${ctx.env})`},
            ingress: [],
            egress: [{
                cidrBlocks: ["0.0.0.0/0"],
                fromPort: 0,
                toPort: 0,
                protocol: "-1"
            }]
        });
    }

    let deps = [task];
    if (opts.dependsOn) {
        deps = deps.concat(opts.dependsOn);
    };

    let installScript = ctx.r(script.ScriptResource, name, {
        script: pulumi.interpolate `
export AWS_DEFAULT_REGION=${region}
aws ecs run-task \
--task-definition ${task.arn} \
--cluster ${opts.cluster} \
--launch-type FARGATE \
--network-configuration \"awsvpcConfiguration={subnets=[${ctx.network.privateSubnets}],securityGroups=[${opts.securityGroup.id}],assignPublicIp=ENABLED}\" \
--query "tasks[0].taskArn" --output text
`
    }, {dependsOn: [task]});

    let waitScript = ctx.r(script.ScriptResource, `${name}-wait`, {
        script: pulumi.interpolate `
export AWS_DEFAULT_REGION=${region}
aws ecs wait tasks-stopped --cluster ${opts.cluster} --tasks ${installScript.result}
`

    });

    return waitScript;
};

//end
