import { ITerraformDependable, ITerraformResource } from "cdktf";
import { Construct, IConstruct } from "constructs";
import { Function as AwsFunction } from "./function";
import { DataAwsLambdaInvocation } from "../.gen/providers/aws/data-aws-lambda-invocation";
import * as cloud from "../cloud";
import * as core from "../core";

/**
 * AWS implementation of `cloud.OnDeploy`.
 *
 * @inflight `@winglang/sdk.cloud.IOnDeployClient`
 */
export class OnDeploy extends cloud.OnDeploy {
  constructor(
    scope: Construct,
    id: string,
    handler: cloud.IOnDeployHandler,
    props: cloud.OnDeployProps = {}
  ) {
    super(scope, id, handler, props);

    let fn = cloud.Function._newFunction(this, "Function", handler, props);
    const awsFn = fn as AwsFunction;

    // Add all of the children of the construct to the dependencies
    const dependsOn: Array<ITerraformDependable> = [];
    for (const c of props.executeAfter ?? []) {
      for (const child of c.node.findAll()) {
        if (isTerraformDependable(child)) {
          dependsOn.push(child);
        }
      }
      this.node.addDependency(c);
    }

    // Currently using the aws_lambda_invocation *data source* since it runs on every terraform apply.
    // If we want OnDeploy to only run code conditionally,
    // We can use the aws_lambda_invocation *resource* instead.
    const lambdaInvocation = new DataAwsLambdaInvocation(this, "Invocation", {
      functionName: awsFn.functionName,
      input: JSON.stringify({}), // Call the function with an empty object
      dependsOn,
    });

    for (const c of props.executeBefore ?? []) {
      // Add the invocation as a dependency on all of the children of the construct
      for (const child of c.node.findAll()) {
        if (isTerraformResource(child)) {
          if (child.dependsOn === undefined) {
            child.dependsOn = [];
          }
          child.dependsOn.push(lambdaInvocation.fqn);
        }
      }
      c.node.addDependency(this);
    }
  }

  /** @internal */
  public _toInflight(): core.Code {
    return core.InflightClient.for(
      __dirname.replace("target-tf-aws", "shared-aws"),
      __filename,
      "OnDeployClient",
      []
    );
  }
}

function isTerraformDependable(
  x: IConstruct
): x is ITerraformDependable & IConstruct {
  return "fqn" in x;
}

function isTerraformResource(
  x: IConstruct
): x is ITerraformResource & IConstruct {
  return "terraformResourceType" in x;
}
