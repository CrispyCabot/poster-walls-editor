import { Duration, RemovalPolicy, Tags } from 'aws-cdk-lib';
import type * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

export interface WebConstructProps {
  /**
   * Serve the SPA from a custom domain. Omitted until DNS is delegated —
   * CloudFront will not accept an alias without a validated certificate, and
   * the certificate cannot validate until the zone answers.
   */
  readonly domainName?: string;
  readonly certificate?: acm.ICertificate;
}

export class WebConstruct extends Construct {
  readonly webBucket: s3.Bucket;
  readonly imagesBucket: s3.Bucket;
  readonly distribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string, props: WebConstructProps = {}) {
    super(scope, id);

    // Default for everything here: the build-output bucket and the
    // distribution. The images bucket overrides it below. The
    // auto-delete-objects handler CDK adds behind the build bucket stays
    // untagged — `CustomResourceProvider` resources are synthesized outside the
    // construct tree, so tag aspects never visit them.
    Tags.of(this).add('component', 'web');

    const bucketDefaults = {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
    } as const;

    this.webBucket = new s3.Bucket(this, 'WebBucket', {
      ...bucketDefaults,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // Poster images. Retained because deleting them would break saved
    // arrangements and any share link already handed out.
    this.imagesBucket = new s3.Bucket(this, 'ImagesBucket', {
      ...bucketDefaults,
      removalPolicy: RemovalPolicy.RETAIN,
      cors: [{
        allowedMethods: [s3.HttpMethods.PUT],
        allowedOrigins: ['*'],
        allowedHeaders: ['*'],
        maxAge: 3000,
      }],
    });

    // Overrides the construct-level `component: web`. This bucket is the one
    // piece of the web tier holding irreplaceable user uploads, and its storage
    // cost grows with usage while the build-output bucket's does not — worth
    // separating in Cost Explorer and in any "what is safe to delete" audit.
    //
    // The explicit priority is what makes this override deterministic. Tag
    // aspects default to priority 100 and are applied root-first, so a deeper
    // scope would usually win on ordering alone — but that is an implementation
    // detail, and stating the priority means the override cannot silently
    // invert if the visit order ever changes.
    Tags.of(this.imagesBucket).add('component', 'media', { priority: 200 });

    // Both or neither: CloudFront rejects an alias without a certificate that
    // covers it, so passing one without the other would fail at deploy time.
    const customDomain =
      props.domainName !== undefined && props.certificate !== undefined
        ? {
            domainNames: [props.domainName],
            certificate: props.certificate,
            minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
          }
        : {};

    this.distribution = new cloudfront.Distribution(this, 'Distribution', {
      ...customDomain,
      defaultRootObject: 'index.html',
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(this.webBucket as s3.IBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      additionalBehaviors: {
        '/i/*': {
          // No originPath. CloudFront does NOT strip the matched pattern before
          // hitting the origin, so `/i/x.jpg` requests the key `i/x.jpg` and
          // objects are stored under `i/` to match. An earlier `originPath` of
          // `/uploads` asked S3 for `uploads/i/x.jpg`, which 404'd — and the
          // SPA error-rewrite below turned that into index.html with a 200, so
          // images silently rendered as blank frames.
          //
          // The `as s3.IBucket` is not redundant: under
          // `exactOptionalPropertyTypes`, `Bucket.isWebsite` is
          // `boolean | undefined` while `IBucket` declares plain `boolean`, so
          // the assignment fails without it.
          origin: origins.S3BucketOrigin.withOriginAccessControl(
            this.imagesBucket as s3.IBucket,
          ),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        },
      },
      // The SPA owns routing, so unknown paths must return index.html rather
      // than S3's 403/404.
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: Duration.minutes(5),
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: Duration.minutes(5),
        },
      ],
    });
  }
}
