import { writeFileSync } from "fs";
import { join, resolve } from "path";
import { Construct } from "constructs";
import { App } from "./app";
import * as cloud from "../cloud";
import * as core from "../core";
import { createBundle } from "../shared/bundling";
import { AwsInflightHost, IAwsInflightHost, NetworkConfig, PolicyStatement } from "../shared-aws";
import { EcsTaskDefinition } from "../.gen/providers/aws/ecs-task-definition";
import { EcsService } from "../.gen/providers/aws/ecs-service";
import { RegistryImage } from "../.gen/providers/docker/registry-image";
import { IamRole } from "../.gen/providers/aws/iam-role";
import { SecurityGroup } from "../.gen/providers/aws/security-group";
import { Image } from "../.gen/providers/docker/image";
import { CloudwatchLogGroup } from "../.gen/providers/aws/cloudwatch-log-group";
import { IInflightHost } from "../std";
import { Lazy } from "cdktf";
import { LiftMap } from "../core";


export class Service extends cloud.Service implements IAwsInflightHost {
  private workdir: string;
  private wrapperEntrypoint: string;
  private policyStatments?: any[];
  private dockerFileName: string;
  private service: EcsService;

  constructor(
    scope: Construct,
    id: string,
    handler: cloud.IServiceHandler,
    props: cloud.ServiceProps = {}
  ) {
    super(scope, id, handler, props);
    // We probably need to create the ECR per app (App.of(this).ecr)

    this.workdir = App.of(this).workdir;
    this.wrapperEntrypoint = join(this.workdir, `${this.assetName}_wrapper.js`);
    this.dockerFileName = `Dockerfile_${this.assetName}`;
    let app = App.of(this) as App;

    // This forces the lazy loading of the properties (TODO: find a better way to do this)
    app.ecrAuth;
    app.dockerProvider;
    app.vpc;
    
    let image = new Image(this, "DockerImage", {
      name: `${app.ecr.repositoryUrl}:${this.assetName}`,
      buildAttribute: {
        context: ".wing",
        dockerfile: this.dockerFileName,
        platform: "linux/amd64",
      }
    });

    new RegistryImage(this, "RegistryImage", {
      name: image.name
    });

    let executionRole = new IamRole(this, "ExecutionRole", {
      assumeRolePolicy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Principal: {
              Service: "ecs-tasks.amazonaws.com",
            },
            Action: "sts:AssumeRole",
          },
        ],
      }),
      inlinePolicy: [{
        name: `${this.assetName}-inline-policy`,
        policy: JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              "Effect": "Allow",
              "Action": [
                "logs:CreateLogStream",
                "logs:PutLogEvents",
                "logs:CreateLogGroup"
              ],
              "Resource": "*"
            },
            {
              "Effect": "Allow",
              "Action": [
                "ecr:BatchGetImage",
                "ecr:GetDownloadUrlForLayer",
                "ecr:GetAuthorizationToken"
              ],
              "Resource": "*"
            }
          ],
        }),
      }]
    });

    let taskRole = new IamRole(this, "TaskRole", {
      assumeRolePolicy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Principal: {
              Service: "ecs-tasks.amazonaws.com",
            },
            Action: "sts:AssumeRole",
          },
        ],
      }),
      inlinePolicy: [{
        name: `${this.assetName}-inline-policy`,
        policy: Lazy.stringValue({
          produce: () => {
            this.policyStatments = this.policyStatments ?? [];
            
            if (this.policyStatments.length !== 0) {
              return JSON.stringify({
                Version: "2012-10-17",
                Statement: this.policyStatments
              });
            }

            return JSON.stringify({
              Version: "2012-10-17",
              Statement: [
                {
                  Effect: "Allow",
                  Action: "none:null",
                  Resource: "*"
                }
              ]
            })
          }
        }),
      }]
    });

    let logGroup = new CloudwatchLogGroup(this, "LogGroup", {
      name: `/ecs/${this.assetName}`,
      retentionInDays: 7,
    });

    let taskDef = new EcsTaskDefinition(this, "Task", {
      family: this.assetName,
      executionRoleArn: executionRole.arn,
      taskRoleArn: taskRole.arn,
      containerDefinitions: Lazy.anyValue({
        produce: () => JSON.stringify([
            {
              name: this.assetName,
              image: image.name,
              environment: Object.entries(this._env).map(([key, value]) => {
                return {
                  name: key,
                  value: value,
                };
              }
              ),
              logConfiguration: {
                logDriver: "awslogs",
                options: {
                  "awslogs-group": `/ecs/${this.assetName}`,
                  "awslogs-region": "us-east-1", // TODO: Can I ignore this?
                  "awslogs-stream-prefix": logGroup.name,
                }
              }
          }
        ])
      }) as any,
      networkMode: "awsvpc",
      requiresCompatibilities: ["FARGATE"],
      memory: "512",
      cpu: "256",
    });

    let subnetIds = app.subnets["private"].map((subnet) => subnet.id);

    let sg = new SecurityGroup(this, "SecurityGroup", {
      vpcId: app.vpc.id,
      egress: [
        {
          fromPort: 0,
          toPort: 0,
          protocol: "-1",
          cidrBlocks: ["0.0.0.0/0"],
        }
      ],
      ingress: [
        { // TODO: Support network config
          fromPort: 0,
          toPort: 0,
          protocol: "-1",
          cidrBlocks: ["0.0.0.0/0"]
        }
      ]
    });

    this.service = new EcsService(this, "Service", {
      name: this.assetName,
      cluster: app.ecsCluster.arn,
      desiredCount: 1,
      launchType: "FARGATE",
      taskDefinition: taskDef.arn,
      forceNewDeployment: true,
      enableExecuteCommand: true,
      networkConfiguration: {
        subnets: subnetIds,
        securityGroups: [
          sg.id
        ]
      }
    });
  }
  
  addPolicyStatements(...policies: PolicyStatement[]): void {
    if (!this.policyStatments) {
      this.policyStatments = [];
    }

    for (const policy of policies) {
      this.policyStatments.push({
        Action: policy.actions,
        Effect: policy.effect ?? "Allow",
        Resource: policy.resources
      })
    }
  }

  addNetwork(config: NetworkConfig): void {
    // TODO: handle networking
    console.log("Adding network", config);
  }

  _liftMap?: LiftMap | undefined;

  /** @internal */
  public _preSynthesize(): void {
    super._preSynthesize();
    let wrapper = `
const service = require("${resolve(this.entrypoint)}");
let isShuttingDown = false;

const startService = async () => {
  while (!isShuttingDown) {
    // Check if shutting down at each iteration or task
    await service.start();
  }
};

const handleShutdown = async () => {
  console.log("Received shutdown signal, stopping service...");
  isShuttingDown = true; // Signal to stop infinite loop
  await service.stop();
  process.exit(0);
};

process.on('SIGTERM', handleShutdown);
process.on('SIGINT', handleShutdown);

(async () => {
  try {
    await startService();
  } catch (error) {
    console.error("Error during service operation:", error);
    process.exit(1);
  }
})();
    `;
    writeFileSync(this.wrapperEntrypoint, wrapper);
    let bundle = createBundle(this.wrapperEntrypoint);
    bundle;

    let dockerFile = `FROM --platform=linux/amd64 node:20-slim
    WORKDIR /app
    COPY ./${this.assetName}_wrapper.js.bundle .
    CMD [ "node", "index.cjs" ]`;

    writeFileSync(join(this.workdir, this.dockerFileName), dockerFile);
  }

  public onLift(host: IInflightHost, ops: string[]): void {
    if (!AwsInflightHost.isAwsInflightHost(host)) {
      throw new Error("Host is not an AWS inflight host");
    }

    let clusterArn = (App.of(this) as App).ecsCluster.arn;
    if (
      ops.includes(cloud.ServiceInflightMethods.START) ||
      ops.includes(cloud.ServiceInflightMethods.STOP)
    ) {
      host.addPolicyStatements({
        actions: ["ecs:UpdateService"],
        resources: [`${clusterArn}`], // TODO: add the service specific ARN (I think I can just do /this.service.name but need to test)
      });
    }

    if (ops.includes(cloud.ServiceInflightMethods.STARTED)) {
      host.addPolicyStatements({
        actions: ["ecs:DescribeServices"],
        resources: [`${clusterArn}`], // TODO: add the service specific ARN (I think I can just do /this.service.name but need to test)
      });
    }


    host.addEnvironment(this.envName(), this.service.name);
    host.addEnvironment("ECS_CLUSTER_NAME", (App.of(this) as App).ecsCluster.name); // TODO: Should I add hash to name?
  }

  /**
   * Add an environment variable to the function 
   */
  public addEnvironment(name: string, value: string): void {
    if (this._env[name] !== undefined && this._env[name] !== value) {
      throw new Error(
        `Environment variable "${name}" already set with a different value.`
      );
    }
    this._env[name] = value;
  }

  /** @internal */
  public _toInflight(): string {
    return core.InflightClient.for(
      __dirname.replace("target-tf-aws", "shared-aws"),
      __filename,
      "ServiceClient",
      [`process.env["ECS_CLUSTER_NAME"]`, `process.env["${this.envName()}"]`]
    )
  }

  private envName(): string {
    return `SERVICE_NAME_${this.node.addr.slice(-8)}`;
  }
}
