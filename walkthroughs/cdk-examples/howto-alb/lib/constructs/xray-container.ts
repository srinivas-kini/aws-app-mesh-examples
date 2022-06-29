import { aws_ecs } from "aws-cdk-lib";
import { Duration } from "aws-cdk-lib";
import { Construct } from "constructs";
import { BaseStack } from "../stacks/base";
import { MeshStack } from "../stacks/mesh-components";

interface XrayContainerProps {
    logStreamPrefix: string
};


export class XrayContainerOptionsConstruct extends Construct {

    private readonly xrayImage = aws_ecs.ContainerImage.fromRegistry(
        "public.ecr.aws/xray/aws-xray-daemon:3.3.3"
    );
    readonly containerDefinitionOptions: aws_ecs.ContainerDefinitionOptions;

    constructor(base: BaseStack, id: string, props: XrayContainerProps) {
        super(base, id);

        this.containerDefinitionOptions = {
            image: this.xrayImage,
            containerName: "xray",
            logging: aws_ecs.LogDriver.awsLogs({
                logGroup: base.logGroup,
                streamPrefix: props.logStreamPrefix,
            }),
            user: "1337",
            portMappings: [
                {
                    containerPort: 2000,
                    protocol: aws_ecs.Protocol.UDP
                }
            ]
        }
    };

};