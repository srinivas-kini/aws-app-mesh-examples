import * as ecs from "aws-cdk-lib/aws-ecs";
import * as ec2 from "aws-cdk-lib/aws-ec2"
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import { aws_ecr_assets, Duration } from "aws-cdk-lib";
import { Construct } from "constructs";
import { MeshStack } from "../stacks/mesh-components";
import { EnvoyContainerOptionsConstruct } from "./envoy-container";
import { XrayContainerOptionsConstruct } from "./xray-container";
import { ColorAppOptionsConstruct } from "./app-container";

export class FrontEndServiceConstruct extends Construct {

  taskDefinition: ecs.FargateTaskDefinition;
  service: ecs.FargateService;
  taskSecGroup: ec2.SecurityGroup;
  readonly constructIdentifier: string = "FrontendService";

  constructor(ms: MeshStack, id: string) {
    super(ms, id);

    this.taskSecGroup = new ec2.SecurityGroup(this, `${this.constructIdentifier}_TaskSecurityGroup`, {
      vpc: ms.sd.base.vpc,
    });
    this.taskSecGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.allTraffic());

    // App Mesh Proxy Config.
    const appMeshProxyConfig = new ecs.AppMeshProxyConfiguration({
      containerName: "envoy",
      properties: {
        proxyIngressPort: 15000,
        proxyEgressPort: 15001,
        appPorts: [ms.sd.base.containerPort],
        ignoredUID: 1337,
        egressIgnoredIPs: ["169.254.170.2", "169.254.169.254"],
      },
    });

    this.taskDefinition = new ecs.FargateTaskDefinition(
      this,
      `${this.constructIdentifier}_TaskDefinition`,
      {
        cpu: 256,
        memoryLimitMiB: 512,
        proxyConfiguration: appMeshProxyConfig,
        executionRole: ms.sd.base.executionRole,
        taskRole: ms.sd.base.taskRole,
        family: "front",
      }
    );

    // Add the Envoy Image to the task def.
    const envoyContainerDefinitionOptions = new EnvoyContainerOptionsConstruct(
      ms.sd.base,
      "FrontEnvoy",
      {
        logStreamPrefix: "front-envoy",
        appMeshResourceARN: `mesh/${ms.mesh.meshName}/virtualNode/${ms.frontendVirtualNode.virtualNodeName}`,
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

    // Add the Xray Image to the task def.enecccdenlgbehnubvnevijbtgdbekllnvlrttgvjbnj

    const xrayContainerDefinitionOpts = new XrayContainerOptionsConstruct(
      ms.sd.base,
      "FrontXray",
      {
        logStreamPrefix: "front-xray",
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

    // Add the Frontend Image to the task def.
    const appContainerOptions = new ColorAppOptionsConstruct(ms, "FrontApp", {
      color: "green",
      xrayAppName: `${ms.mesh.meshName}/${ms.backendV2VirtualNode.virtualNodeName}`,
      logStreamPrefix: "front-app",
      image: new aws_ecr_assets.DockerImageAsset(this, `FrontAppImageAsset`, {
        directory: ".././howto-alb/feapp",
        platform: aws_ecr_assets.Platform.LINUX_AMD64,
      })
    }).containerDefinitionOptions;

    const appContainer = this.taskDefinition.addContainer(
      `${this.constructIdentifier}_ColorAppContainer`,
      appContainerOptions
    );

    appContainer.addContainerDependencies({
      container: xrayContainer,
      condition: ecs.ContainerDependencyCondition.START,
    });
    appContainer.addContainerDependencies({
      container: envoyContainer,
      condition: ecs.ContainerDependencyCondition.HEALTHY,
    });

    const listener = ms.sd.frontendLoadBalancer.addListener(`${this.constructIdentifier}_Listener`, {
      port: 80,
      open: true,
    });

    this.service = new ecs.FargateService(this, `${this.constructIdentifier}_Service`, {
      serviceName: "frontend",
      cluster: ms.sd.base.cluster,
      taskDefinition: this.taskDefinition,
      desiredCount: 1,
      maxHealthyPercent: 200,
      minHealthyPercent: 100,
      enableExecuteCommand: true,
      securityGroups: [this.taskSecGroup],
    });

    this.service.registerLoadBalancerTargets({
      containerName: "app",
      containerPort: ms.sd.base.containerPort,
      newTargetGroupId: `${this.constructIdentifier}_TargetGroup`,
      listener: ecs.ListenerConfig.applicationListener(listener, {
        protocol: elbv2.ApplicationProtocol.HTTP,
        healthCheck: {
          path: "/ping",
          port: ms.sd.base.containerPort.toString(),
          timeout: Duration.seconds(5),
          interval: Duration.seconds(60),
        },
      }),
    });
  }
}
