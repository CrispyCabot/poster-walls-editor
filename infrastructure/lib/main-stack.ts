import { CfnOutput, Stack, type StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { ApiConstruct } from './constructs/api.js';
import { DataConstruct } from './constructs/data.js';

export interface MainStackProps extends StackProps {
  /** Custom domain stays off until Namecheap NS delegation lands (Plan 4). */
  readonly useCustomDomain: boolean;
}

export class MainStack extends Stack {
  constructor(scope: Construct, id: string, props: MainStackProps) {
    super(scope, id, props);

    const data = new DataConstruct(this, 'Data');
    const api = new ApiConstruct(this, 'Api', { table: data.table });

    new CfnOutput(this, 'ApiUrl', { value: api.httpApi.apiEndpoint });
    new CfnOutput(this, 'TableName', { value: data.table.tableName });
  }
}
