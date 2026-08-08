import { CfnOutput, Fn, Stack, Tags, type StackProps } from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import { Construct } from 'constructs';
import { ApiConstruct } from './constructs/api.js';
import { AuthConstruct } from './constructs/auth.js';
import { DataConstruct } from './constructs/data.js';
import { WebConstruct } from './constructs/web.js';
import { applyStandardTags } from './tags.js';

/** The subdomain the app lives on. Its zone is delegated; the apex is not. */
export const DOMAIN_NAME = 'poster-editor.chrisbridewell.dev';
export const API_DOMAIN_NAME = `api.${DOMAIN_NAME}`;

export interface MainStackProps extends StackProps {
  /**
   * Attach the custom domain.
   *
   * This is a two-phase switch, and the order is forced by ACM. The hosted
   * zone is created either way, so its nameservers can be read from the stack
   * outputs and delegated at the registrar. Only once that delegation resolves
   * can a DNS-validated certificate be issued — turn this on before then and
   * the deploy sits for hours waiting on a validation record nothing can see,
   * then rolls back.
   */
  readonly useCustomDomain: boolean;
}

export class MainStack extends Stack {
  constructor(scope: Construct, id: string, props: MainStackProps) {
    super(scope, id, props);

    applyStandardTags(this);

    const data = new DataConstruct(this, 'Data');

    // Created in both phases. A zone with no records costs $0.50/month and is
    // what makes the delegation step possible at all.
    const zone = new route53.PublicHostedZone(this, 'Zone', {
      zoneName: DOMAIN_NAME,
      comment: 'Delegated subdomain; the apex stays with the registrar',
    });
    Tags.of(zone).add('component', 'dns');

    // One certificate covers both names. CloudFront requires us-east-1 and the
    // whole stack lives there, so no cross-region stack is needed.
    const certificate = props.useCustomDomain
      ? new acm.Certificate(this, 'Certificate', {
          domainName: DOMAIN_NAME,
          subjectAlternativeNames: [API_DOMAIN_NAME],
          validation: acm.CertificateValidation.fromDns(zone),
        })
      : undefined;

    if (certificate !== undefined) {
      Tags.of(certificate).add('component', 'dns');
    }

    const web = new WebConstruct(this, 'Web', {
      ...(certificate === undefined
        ? {}
        : { domainName: DOMAIN_NAME, certificate }),
    });

    const webUrl = props.useCustomDomain
      ? `https://${DOMAIN_NAME}`
      : `https://${web.distribution.distributionDomainName}`;

    const auth = new AuthConstruct(this, 'Auth', {
      // Both origins stay registered through the cutover, so a session started
      // on the CloudFront URL is not stranded the moment the domain goes live.
      webOrigins: [
        `https://${web.distribution.distributionDomainName}`,
        ...(props.useCustomDomain ? [`https://${DOMAIN_NAME}`] : []),
        'http://localhost:5173',
      ],
    });

    const api = new ApiConstruct(this, 'Api', {
      table: data.table,
      ...(certificate === undefined
        ? {}
        : { domainName: API_DOMAIN_NAME, certificate }),
    });

    const apiUrl =
      api.domain === undefined ? api.httpApi.apiEndpoint : `https://${API_DOMAIN_NAME}`;

    api.fn.addEnvironment('USER_POOL_ID', auth.userPool.userPoolId);
    api.fn.addEnvironment('USER_POOL_CLIENT_ID', auth.client.userPoolClientId);
    api.fn.addEnvironment('WEB_ORIGIN', webUrl);
    api.fn.addEnvironment('IMAGES_BUCKET', web.imagesBucket.bucketName);
    // The API mints presigned PUT URLs, which requires it to hold the
    // permission it is delegating.
    web.imagesBucket.grantPut(api.fn);

    if (api.domain !== undefined) {
      const toDistribution = route53.RecordTarget.fromAlias(
        new targets.CloudFrontTarget(web.distribution),
      );

      new route53.ARecord(this, 'AppAlias', { zone, target: toDistribution });
      new route53.AaaaRecord(this, 'AppAliasV6', { zone, target: toDistribution });

      new route53.ARecord(this, 'ApiAlias', {
        zone,
        recordName: 'api',
        target: route53.RecordTarget.fromAlias(
          new targets.ApiGatewayv2DomainProperties(
            api.domain.regionalDomainName,
            api.domain.regionalHostedZoneId,
          ),
        ),
      });
    }

    new CfnOutput(this, 'ApiUrl', { value: apiUrl });
    new CfnOutput(this, 'TableName', { value: data.table.tableName });
    new CfnOutput(this, 'WebUrl', { value: webUrl });
    new CfnOutput(this, 'ImagesBucketName', { value: web.imagesBucket.bucketName });
    new CfnOutput(this, 'WebBucketName', { value: web.webBucket.bucketName });
    new CfnOutput(this, 'DistributionId', { value: web.distribution.distributionId });
    new CfnOutput(this, 'UserPoolId', { value: auth.userPool.userPoolId });
    new CfnOutput(this, 'UserPoolClientId', { value: auth.client.userPoolClientId });
    new CfnOutput(this, 'CognitoDomain', {
      value: `https://${auth.domainPrefix}.auth.${this.region}.amazoncognito.com`,
    });

    // The whole point of phase one: these four go into the registrar.
    new CfnOutput(this, 'ZoneNameServers', {
      description: 'Add these as NS records for host "poster-editor" at your registrar',
      value: Fn.join(', ', zone.hostedZoneNameServers ?? []),
    });
    new CfnOutput(this, 'CustomDomainEnabled', {
      value: String(props.useCustomDomain),
    });
  }
}
