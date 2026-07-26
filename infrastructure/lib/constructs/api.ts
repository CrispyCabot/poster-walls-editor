import { Duration } from 'aws-cdk-lib';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import type * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import { fileURLToPath } from 'node:url';

export interface ApiConstructProps {
  readonly table: dynamodb.TableV2;
}

export class ApiConstruct extends Construct {
  readonly httpApi: apigwv2.HttpApi;
  readonly fn: NodejsFunction;

  constructor(scope: Construct, id: string, props: ApiConstructProps) {
    super(scope, id);

    this.fn = new NodejsFunction(this, 'Fn', {
      entry: fileURLToPath(new URL('../../../api/src/lambda.ts', import.meta.url)),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 512,
      timeout: Duration.seconds(15),
      logRetention: logs.RetentionDays.ONE_MONTH,
      environment: {
        TABLE_NAME: props.table.tableName,
        NODE_OPTIONS: '--enable-source-maps',
      },
      bundling: { minify: true, sourceMap: true },
    });

    props.table.grantReadWriteData(this.fn);

    this.httpApi = new apigwv2.HttpApi(this, 'HttpApi', {
      // Hono owns CORS so preflight and actual responses stay consistent.
      //
      // Deliberately NOT named 'Default': `constructs`' addressOf() hashes
      // path components but skips any literally named "Default" (so trees
      // can be refactored without changing logical IDs). HttpApi's own
      // defaultIntegration route is itself an internal construct named
      // 'DefaultRoute'; naming this integration 'Default' makes its L1
      // resource's hashed path collide with the route's own L1 resource
      // once the "Default" segment is stripped, producing two different
      // CloudFormation resources with the same logical ID
      // ("SectionAlreadyContains") at synth time.
      defaultIntegration: new HttpLambdaIntegration('DefaultIntegration', this.fn),
    });
  }
}
