import * as ecs from "aws-cdk-lib/aws-ecs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import { aws_ecr_assets, Duration } from "aws-cdk-lib";
import { Construct } from "constructs";
import { MeshStack } from "../stacks/mesh-components";
import { EnvoyContainerOptionsConstruct } from "./envoy-container";
import { XrayContainerOptionsConstruct } from "./xray-container";
import { ColorAppOptionsConstruct } from "./app-container";

export class BackendServiceV2Construct extends Construct {
  taskDefinition: ecs.FargateTaskDefinition;
  service: ecs.FargateService;
  taskSecGroup: ec2.SecurityGroup;
  private readonly constructIdentifier: string = "BackendServiceV2";

  constructor(ms: MeshStack, id: string) {
    super(ms, id);

    this.taskSecGroup = new ec2.SecurityGroup(
      this,
      `${this.constructIdentifier}_TaskSecurityGroup`,
      {
        vpc: ms.sd.base.vpc,
      }
    );
    this.taskSecGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.allTraffic());

    // Task Definition
    this.taskDefinition = new ecs.FargateTaskDefinition(
      this,
      `${this.constructIdentifier}_TaskDefinition`,
      {
        cpu: 256,
        memoryLimitMiB: 512,
        executionRole: ms.sd.base.executionRole,
        taskRole: ms.sd.base.taskRole,
        family: "green",
      }
    );

    // Add the Envoy container
    const envoyContainerDefinitionOptions = new EnvoyContainerOptionsConstruct(
      ms.sd.base,
      "BV2Envoy",
      {
        logStreamPrefix: "backend-v2-envoy",
        appMeshResourceARN: `mesh/${ms.mesh.meshName}/virtualNode/${ms.backendV2VirtualNode.virtualNodeName}`,
      }
    ).containerDefinitionOptions;

    const envoyContainer = this.taskDefinition.addContainer(
      `${this.constructIdentifier}_EnvoyContainer`,
      envoyContainerDefinitionOptions
    );

    envoyContainer.addUlimits({
      name: ecs.UlimitName.NOFILE,
      hardLimit: 15000,
      softLimit: 15000,
    });

    //Add the Xray container
    const xrayContainerDefinitionOpts = new XrayContainerOptionsConstruct(
      ms.sd.base,
      "BV2Xray",
      {
        logStreamPrefix: "backend-v2-xray",
      }
    ).containerDefinitionOptions;

    const xrayContainer = this.taskDefinition.addContainer(
      `${this.constructIdentifier}_XrayContainer`,
      xrayContainerDefinitionOpts
    );

    envoyContainer.addContainerDependencies({
      container: xrayContainer,
      condition: ecs.ContainerDependencyCondition.START,
    });

    // Add the colorApp Container
    const colorAppImageOpts = new ColorAppOptionsConstruct(ms, "BV2ColorApp", {
      color: "green",
      xrayAppName: `${ms.mesh.meshName}/${ms.backendV2VirtualNode.virtualNodeName}`,
      logStreamPrefix: "backend-v2-app",
      image: new aws_ecr_assets.DockerImageAsset(this, `ColorAppImageAsset`, {
        directory: ".././howto-alb/colorapp",
        platform: aws_ecr_assets.Platform.LINUX_AMD64, })
    }).containerDefinitionOptions;

    const colorAppContainer = this.taskDefinition.addContainer(
      `${this.constructIdentifier}_ColorAppContainer`,
      colorAppImageOpts
    );

    colorAppContainer.addContainerDependencies({
      container: xrayContainer,
      condition: ecs.ContainerDependencyCondition.START,
    });
    colorAppContainer.addContainerDependencies({
      container: envoyContainer,
      condition: ecs.ContainerDependencyCondition.HEALTHY,
    });

    // Define the Fargate Service and link it to CloudMap service discovery
    this.service = new ecs.FargateService(
      this,
      `${this.constructIdentifier}_Service`,
      {
        cluster: ms.sd.base.cluster,
        serviceName: ms.sd.backendV2CloudMapService.serviceName,
        taskDefinition: this.taskDefinition,
        assignPublicIp: false,
        desiredCount: 1,
        maxHealthyPercent: 200,
        minHealthyPercent: 100,
        enableExecuteCommand: true,
        securityGroups: [this.taskSecGroup],
      },
    );
    
      this.service.associateCloudMapService({
        container: colorAppContainer,
        containerPort: ms.sd.base.containerPort,
        service: ms.sd.backendV2CloudMapService,
      });
  }
};
