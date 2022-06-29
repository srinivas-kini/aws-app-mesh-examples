import { aws_ecr_assets, aws_ecs } from "aws-cdk-lib";
import { Duration } from "aws-cdk-lib";
import { Construct } from "constructs";
import { BaseStack } from "../stacks/base";
import { MeshStack } from "../stacks/mesh-components";

interface AppContainerProps {
    logStreamPrefix: string,
    xrayAppName: string,
    color: string,
    image: aws_ecr_assets.DockerImageAsset;
};

export class ColorAppOptionsConstruct extends Construct {

    readonly containerDefinitionOptions: aws_ecs.ContainerDefinitionOptions;

    constructor(ms: MeshStack, id: string, props: AppContainerProps) {
        super(ms, id);

        this.containerDefinitionOptions = {
            image: aws_ecs.ContainerImage.fromDockerImageAsset(props.image),
            containerName: "app",
            environment: {
                COLOR: props.color,
                PORT: ms.sd.base.containerPort.toString(),
                XRAY_APP_NAME: props.xrayAppName //`${ms.mesh.meshName}/${ms.backendV2VirtualNode.virtualNodeName}`,
            },
            logging: aws_ecs.LogDriver.awsLogs({
                logGroup: ms.sd.base.logGroup,
                streamPrefix: props.logStreamPrefix,
            }),
            portMappings: [
                {
                    containerPort: ms.sd.base.containerPort,
                    hostPort: ms.sd.base.containerPort,
                    protocol: aws_ecs.Protocol.TCP,
                }
            ]
        }
    }
};