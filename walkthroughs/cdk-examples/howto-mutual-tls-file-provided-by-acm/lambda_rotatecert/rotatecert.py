import json
import boto3
import base64
import time
import os
sm = boto3.client('secretsmanager')
cm = boto3.client('acm')
ecs = boto3.client('ecs')
ecs_cluster = os.environ['CLUSTER']
color_gateway_svc = os.environ['SVC_GATEWAY']
color_teller_svc = os.environ['SVC_TELLER']
gate_cm = os.environ['COLOR_GATEWAY_ACM_ARN']
teller_cm = os.environ['COLOR_TELLER_ACM_ARN']
secret = os.environ['SECRET']

print('ecs_cluster -> ', ecs_cluster)
print('color_gateway_svc -> ', color_gateway_svc)
print('color_teller_svc -> ', color_teller_svc)
print('gate_cm -> ', gate_cm)
print('teller_cm -> ', teller_cm)
print('secret -> ', secret)


def lambda_handler(event, context):
    print(json.dumps(event))

    cm.renew_certificate(CertificateArn=teller_cm)
    cm.renew_certificate(CertificateArn=gate_cm)
    time.sleep(5)  # allow time for acm to renew cert from acm-pca
    passphrase = sm.get_random_password(ExcludePunctuation=True)[
        'RandomPassword']
    passphrase_enc = base64.b64encode(passphrase.encode('utf-8'))
    cm.export_certificate(CertificateArn=teller_cm, Passphrase=passphrase_enc)
    gate_rsp = cm.export_certificate(
        CertificateArn=gate_cm, Passphrase=passphrase_enc)
    sm_value = {}
    sm_value['GatewayCertificate'] = gate_rsp['Certificate']
    sm_value['GatewayCertificateChain'] = gate_rsp['CertificateChain']
    sm_value['GatewayPrivateKey'] = gate_rsp['PrivateKey']
    sm_value['Passphrase'] = passphrase
    sm.put_secret_value(SecretId=secret, SecretString=json.dumps(sm_value))
    ecs.update_service(
        cluster=ecs_cluster,
        service=color_teller_svc,
        forceNewDeployment=True)
    ecs.update_service(
        cluster=ecs_cluster,
        service=color_gateway_svc,
        forceNewDeployment=True)
