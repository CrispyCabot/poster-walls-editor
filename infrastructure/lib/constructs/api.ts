import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import type * as acm from 'aws-cdk-lib/aws-certificatemanager';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import type * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import { fileURLToPath } from 'node:url';

export interface ApiConstructProps {
  readonly table: dynamodb.TableV2;
  /**
   * Serve the API from a custom domain. Omitted until DNS is delegated — the
   * certificate cannot validate until the zone answers.
   */
  readonly domainName?: string;
  readonly certificate?: acm.ICertificate;
}

export class ApiConstruct extends Construct {
  readonly httpApi: apigwv2.HttpApi;
  readonly fn: NodejsFunction;
  /** Present only when a custom domain is configured. */
  readonly domain: apigwv2.DomainName | undefined;

  constructor(scope: Construct, id: string, props: ApiConstructProps) {
    super(scope, id);

    // The Lambda's log group already exists in production (auto-created by
    // Lambda on first invocation, named /aws/lambda/<function-name>). We
    // deliberately do NOT set `logGroupName` here: doing so would make
    // CloudFormation try to CREATE a group with that already-existing name
    // and fail with "already exists", rolling back the stack. Leaving the
    // name unset lets CDK/CloudFormation generate a fresh, non-colliding
    // name; the old auto-created group is simply orphaned (stops receiving
    // new logs, ages out per its already-set 30-day retention).
    const logGroup = new logs.LogGroup(this, 'FnLogGroup', {
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    this.fn = new NodejsFunction(this, 'Fn', {
      entry: fileURLToPath(new URL('../../../api/src/lambda.ts', import.meta.url)),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_24_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 512,
      timeout: Duration.seconds(15),
      logGroup,
      environment: {
        TABLE_NAME: props.table.tableName,
        NODE_OPTIONS: '--enable-source-maps',
      },
      bundling: { minify: true, sourceMap: true },
    });

    props.table.grantReadWriteData(this.fn);

    if (props.domainName !== undefined && props.certificate !== undefined) {
      this.domain = new apigwv2.DomainName(this, 'DomainName', {
        domainName: props.domainName,
        certificate: props.certificate,
      });
    }

    this.httpApi = new apigwv2.HttpApi(this, 'HttpApi', {
      ...(this.domain === undefined
        ? {}
        : {
            defaultDomainMapping: { domainName: this.domain },
          }),
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
