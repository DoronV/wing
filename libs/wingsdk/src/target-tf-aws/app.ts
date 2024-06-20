import { Api } from "./api";
import { BUCKET_PREFIX_OPTS, Bucket } from "./bucket";
import { Counter } from "./counter";
import { Endpoint } from "./endpoint";
import { Function } from "./function";
import { OnDeploy } from "./on-deploy";
import { Queue } from "./queue";
import { Redis } from "./redis";
import { Schedule } from "./schedule";
import { Secret } from "./secret";
import { Service } from "./service";
import { Table } from "./table";
import { TestRunner } from "./test-runner";
import { Topic } from "./topic";
import { Website } from "./website";
import { DataAwsCallerIdentity } from "../.gen/providers/aws/data-aws-caller-identity";
import { DataAwsEcrAuthorizationToken } from "../.gen/providers/aws/data-aws-ecr-authorization-token";
import { DataAwsRegion } from "../.gen/providers/aws/data-aws-region";
import { DataAwsSubnet } from "../.gen/providers/aws/data-aws-subnet";
import { DataAwsVpc } from "../.gen/providers/aws/data-aws-vpc";
import { EcrRepository } from "../.gen/providers/aws/ecr-repository";
import { EcsCluster } from "../.gen/providers/aws/ecs-cluster";
import { EcsClusterCapacityProviders } from "../.gen/providers/aws/ecs-cluster-capacity-providers";
import { Eip } from "../.gen/providers/aws/eip";
import { InternetGateway } from "../.gen/providers/aws/internet-gateway";
import { NatGateway } from "../.gen/providers/aws/nat-gateway";
import { AwsProvider } from "../.gen/providers/aws/provider";
import { RouteTable } from "../.gen/providers/aws/route-table";
import { RouteTableAssociation } from "../.gen/providers/aws/route-table-association";
import { S3Bucket } from "../.gen/providers/aws/s3-bucket";
import { Subnet } from "../.gen/providers/aws/subnet";
import { Vpc } from "../.gen/providers/aws/vpc";
import { DockerProvider } from "../.gen/providers/docker/provider";
import {
  API_FQN,
  BUCKET_FQN,
  COUNTER_FQN,
  DOMAIN_FQN,
  ENDPOINT_FQN,
  FUNCTION_FQN,
  ON_DEPLOY_FQN,
  QUEUE_FQN,
  SCHEDULE_FQN,
  SECRET_FQN,
  SERVICE_FQN,
  TOPIC_FQN,
  WEBSITE_FQN,
} from "../cloud";
import { AppProps } from "../core";
import { TABLE_FQN, REDIS_FQN } from "../ex";
import { NameOptions, ResourceNames } from "../shared/resource-names";
import { Domain } from "../shared-aws/domain";
import { CdktfApp } from "../shared-tf/app";
import { TEST_RUNNER_FQN } from "../std";

/**
 * An app that knows how to synthesize constructs into a Terraform configuration
 * for AWS resources.
 */
export class App extends CdktfApp {
  public readonly _target = "tf-aws";

  private awsRegionProvider?: DataAwsRegion;
  private awsAccountIdProvider?: DataAwsCallerIdentity;
  private _vpc?: Vpc | DataAwsVpc;
  private _codeBucket?: S3Bucket;
  private _ecr?: EcrRepository;
  private _ecr_auth?: DataAwsEcrAuthorizationToken;
  private _dockerProvider?: DockerProvider;
  private _ecsCluster?: EcsCluster;

  /** Subnets shared across app */
  public subnets: { [key: string]: (Subnet | DataAwsSubnet)[] };

  constructor(props: AppProps) {
    super(props);
    new AwsProvider(this, "aws", {});

    this.subnets = {
      private: [],
      public: [],
    };

    TestRunner._createTree(this, props.rootConstruct);
  }

  protected typeForFqn(fqn: string): any {
    switch (fqn) {
      case API_FQN:
        return Api;

      case FUNCTION_FQN:
        return Function;

      case BUCKET_FQN:
        return Bucket;

      case QUEUE_FQN:
        return Queue;

      case TOPIC_FQN:
        return Topic;

      case COUNTER_FQN:
        return Counter;

      case SCHEDULE_FQN:
        return Schedule;

      case TABLE_FQN:
        return Table;

      case TOPIC_FQN:
        return Topic;

      case TEST_RUNNER_FQN:
        return TestRunner;

      case REDIS_FQN:
        return Redis;

      case WEBSITE_FQN:
        return Website;

      case SECRET_FQN:
        return Secret;

      case ON_DEPLOY_FQN:
        return OnDeploy;

      case DOMAIN_FQN:
        return Domain;

      case ENDPOINT_FQN:
        return Endpoint;

      case SERVICE_FQN:
        return Service;
    }

    return undefined;
  }

  /**
   * The AWS account ID of the App
   */
  public get accountId(): string {
    if (!this.awsAccountIdProvider) {
      this.awsAccountIdProvider = new DataAwsCallerIdentity(this, "account");
    }
    return this.awsAccountIdProvider.accountId;
  }

  /**
   * The AWS region of the App
   */
  public get region(): string {
    if (!this.awsRegionProvider) {
      this.awsRegionProvider = new DataAwsRegion(this, "Region");
    }
    return this.awsRegionProvider.name;
  }

  public get codeBucket(): S3Bucket {
    if (this._codeBucket) {
      return this._codeBucket;
    }
    const bucket = new S3Bucket(this, "Code");
    const bucketPrefix = ResourceNames.generateName(bucket, BUCKET_PREFIX_OPTS);
    bucket.bucketPrefix = bucketPrefix;
    this._codeBucket = bucket;
    return this._codeBucket;
  }

  /**
   * Returns the VPC for this app. Will create a new VPC if one does not exist.
   */
  public get vpc(): Vpc | DataAwsVpc {
    if (this._vpc) {
      return this._vpc;
    }

    return this.parameters.value(`${this._target}/vpc`) === "existing"
      ? this.importExistingVpc()
      : this.createDefaultVpc();
  }

  private importExistingVpc(): DataAwsVpc {
    const vpcId = this.parameters.value(`${this._target}/vpc_id`);
    const privateSubnetIds = this.parameters.value(
      `${this._target}/private_subnet_ids`
    );
    const publicSubnetIds = this.parameters.value(
      `${this._target}/public_subnet_ids`
    );

    this._vpc = new DataAwsVpc(this, "ExistingVpc", {
      id: vpcId,
    });

    for (const subnetId of privateSubnetIds) {
      this.subnets.private.push(
        new DataAwsSubnet(this, `PrivateSubnet${subnetId.slice(-8)}`, {
          vpcId: vpcId,
          id: subnetId,
        })
      );
    }

    if (publicSubnetIds) {
      for (const subnetId of publicSubnetIds) {
        this.subnets.public.push(
          new DataAwsSubnet(this, `PublicSubnet${subnetId.slice(-8)}`, {
            vpcId: vpcId,
            id: subnetId,
          })
        );
      }
    }

    return this._vpc;
  }

  private createDefaultVpc(): Vpc {
    const VPC_NAME_OPTS: NameOptions = {
      maxLen: 32,
      disallowedRegex: /[^a-zA-Z0-9-]/,
    };
    const identifier = ResourceNames.generateName(this, VPC_NAME_OPTS);

    // create the app wide VPC
    this._vpc = new Vpc(this, "VPC", {
      cidrBlock: "10.0.0.0/16",
      enableDnsHostnames: true,
      enableDnsSupport: true,
      tags: {
        Name: `${identifier}-vpc`,
      },
    });

    // Create the subnets for the VPC, in order to ensure internet egress there
    // is a minimum requirement of 2 subnets, one public and one private. As well
    // as a NAT gateway and internet gateway. The NAT gateway is required to
    // allow the private subnet to route traffic to the internet. The internet
    // gateway is required to allow the NAT gateway to route traffic to the
    // internet.

    // Create the public subnet.
    // This subnet is intentionally small since most resources will be behind
    // private subnets. Incase that assumption is wrong this leaves room for 3 more /24 public subnets
    const publicSubnet = new Subnet(this, "PublicSubnet", {
      vpcId: this._vpc.id,
      cidrBlock: "10.0.0.0/24", // 10.0.0.0 - 10.0.0.255
      availabilityZone: `${this.region}a`,
      tags: {
        Name: `${identifier}-public-subnet-1`,
      },
    });

    // Create the private subnet
    const privateSubnet = new Subnet(this, "PrivateSubnet", {
      vpcId: this._vpc.id,
      cidrBlock: "10.0.4.0/22", // 10.0.4.0 - 10.0.7.255
      availabilityZone: `${this.region}a`,
      tags: {
        Name: `${identifier}-private-subnet-1`,
      },
    });

    const privateSubnet2 = new Subnet(this, "PrivateSubnet2", {
      vpcId: this._vpc.id,
      cidrBlock: "10.0.8.0/22", // 10.0.8.0 - 10.0.11.255
      availabilityZone: `${this.region}b`,
      tags: {
        Name: `${identifier}-private-subnet-2`,
      },
    });

    // Create the internet gateway
    const internetGateway = new InternetGateway(this, "InternetGateway", {
      vpcId: this._vpc.id,
      tags: {
        Name: `${identifier}-internet-gateway`,
      },
    });

    // Create NAT gateway and Elastic IP for NAT
    const eip = new Eip(this, "EIP", {});
    const nat = new NatGateway(this, "NATGateway", {
      allocationId: eip.id,
      subnetId: publicSubnet.id,
      tags: {
        Name: `${identifier}-nat-gateway`,
      },
    });

    // Create route tables for public and private subnets
    const publicRouteTable = new RouteTable(this, "PublicRouteTable", {
      vpcId: this._vpc.id,
      route: [
        {
          // This will route all traffic to the internet gateway
          cidrBlock: "0.0.0.0/0",
          gatewayId: internetGateway.id,
        },
      ],
      tags: {
        Name: `${identifier}-public-route-table-1`,
      },
    });

    const privateRouteTable = new RouteTable(this, "PrivateRouteTable", {
      vpcId: this._vpc.id,
      route: [
        {
          // This will route all traffic to the NAT gateway
          cidrBlock: "0.0.0.0/0",
          natGatewayId: nat.id,
        },
      ],
      tags: {
        Name: `${identifier}-private-route-table-1`,
      },
    });

    const privateRouteTable2 = new RouteTable(this, "PrivateRouteTable2", {
      vpcId: this._vpc.id,
      route: [
        {
          // This will route all traffic to the NAT gateway
          cidrBlock: "0.0.0.0/0",
          natGatewayId: nat.id,
        },
      ],
      tags: {
        Name: `${identifier}-private-route-table-2`,
      },
    });

    // Associate route tables with subnets
    new RouteTableAssociation(this, "PublicRouteTableAssociation", {
      subnetId: publicSubnet.id,
      routeTableId: publicRouteTable.id,
    });

    new RouteTableAssociation(this, "PrivateRouteTableAssociation", {
      subnetId: privateSubnet.id,
      routeTableId: privateRouteTable.id,
    });

    new RouteTableAssociation(this, "PrivateRouteTableAssociation2", {
      subnetId: privateSubnet2.id,
      routeTableId: privateRouteTable2.id,
    });

    this.subnets.public.push(publicSubnet);
    this.subnets.private.push(privateSubnet);
    this.subnets.private.push(privateSubnet2);
    return this._vpc;
  }

  /**
   * The ECR Repository for the App
   */
  public get ecr(): EcrRepository {
    if (this._ecr) {
      return this._ecr;
    }

    const ecr = new EcrRepository(this, "Ecr", {
      name: "my-ecr-repo", // TODO: make this configurable
    });

    this._ecr = ecr;
    return this._ecr;
  }

  /**
   * The ECR Authorization Token for the App
   */
  public get ecrAuth(): DataAwsEcrAuthorizationToken {
    if (this._ecr_auth) {
      return this._ecr_auth;
    }

    if (!this._ecr) {
      this.ecr;
    }

    const ecrAuth = new DataAwsEcrAuthorizationToken(this, "EcrAuth", {
      registryId: this.accountId,
    });

    this._ecr_auth = ecrAuth;
    return this._ecr_auth;
  }

  /**
   * The Docker Provider for the App
   */
  public get dockerProvider(): DockerProvider {
    if (this._dockerProvider) {
      return this._dockerProvider;
    }

    if (!this._ecr_auth) {
      this.ecrAuth;
    }

    this._dockerProvider = new DockerProvider(this, "DockerProvider", {
      registryAuth: [
        {
          address: this.ecrAuth.proxyEndpoint,
          username: this.ecrAuth.userName,
          password: this.ecrAuth.password,
        },
      ],
    });

    return this._dockerProvider;
  }

  /**
   * The ECS Cluster for the App
   */
  public get ecsCluster(): EcsCluster {
    if (this._ecsCluster) {
      return this._ecsCluster;
    }

    this._ecsCluster = new EcsCluster(this, "EcsCluster", {
      name: "my-ecs-cluster", // TODO: make this configurable
    });

    new EcsClusterCapacityProviders(this, "EcsClusterCapacityProviders", {
      clusterName: this._ecsCluster.name,
      capacityProviders: ["FARGATE"],
    });

    return this._ecsCluster;
  }
}
