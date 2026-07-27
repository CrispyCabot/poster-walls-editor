import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

export class WebConstruct extends Construct {
  readonly webBucket: s3.Bucket;
  readonly imagesBucket: s3.Bucket;
  readonly distribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string) {
    super(scope, id);

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

    this.distribution = new cloudfront.Distribution(this, 'Distribution', {
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
