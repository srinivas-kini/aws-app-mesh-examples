import { aws_ecs } from "aws-cdk-lib";
import { Duration } from "aws-cdk-lib";
import { Construct } from "constructs";
import { BaseStack } from "../stacks/base";
import { MeshStack } from "../stacks/mesh-components";

interface EnvoyContainerProps {
    logStreamPrefix: string,
    appMeshResourceARN: string,
};


export class EnvoyContainerOptionsConstruct extends Construct {

    private readonly envoyImage = aws_ecs.ContainerImage.fromRegistry(
        "public.ecr.aws/appmesh/aws-appmesh-envoy:v1.21.2.0-prod"
    );
    readonly containerDefinitionOptions: aws_ecs.ContainerDefinitionOptions;

    constructor(base: BaseStack, id: string, props: EnvoyContainerProps) {
        super(base, id);

        this.containerDefinitionOptions = {
            image: this.envoyImage,
            containerName: "envoy",
            user: "1337",
            environment: {
                ENVOY_LOG_LEVEL: "debug",
                ENABLE_ENVOY_XRAY_TRACING: "1",
                ENABLE_ENVOY_STATS_TAGS: "1",
                APPMESH_VIRTUAL_NODE_NAME: props.appMeshResourceARN,
            },
            healthCheck: {
                retries: 10,
                interval: Duration.seconds(5),
                timeout: Duration.seconds(10),
                command: [
                    "CMD-SHELL",
                    "curl -s http://localhost:9901/server_info | grep state | grep -q LIVE",
                ],
            },
            logging: aws_ecs.LogDriver.awsLogs({
                logGroup: base.logGroup,
                streamPrefix: props.logStreamPrefix,
            }),
            portMappings: [
                {
                    containerPort: 9901,
                    protocol: aws_ecs.Protocol.TCP,
                },
                {
                    containerPort: 15000,
                    protocol: aws_ecs.Protocol.TCP,
                },
                {
                    containerPort: 15001,
                    protocol: aws_ecs.Protocol.TCP,
                },
            ],
        };

    }
};