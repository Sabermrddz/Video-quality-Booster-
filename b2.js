const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const configured = Boolean(
  process.env.B2_KEY_ID &&
  process.env.B2_APP_KEY &&
  process.env.B2_BUCKET &&
  process.env.B2_ENDPOINT &&
  process.env.B2_REGION
);

const s3 = configured
  ? new S3Client({
      region: process.env.B2_REGION,
      endpoint: process.env.B2_ENDPOINT,
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env.B2_KEY_ID,
        secretAccessKey: process.env.B2_APP_KEY,
      },
    })
  : null;

const URL_TTL_SECONDS = 20 * 60;

async function presignPut(key) {
  const cmd = new PutObjectCommand({ Bucket: process.env.B2_BUCKET, Key: key });
  return getSignedUrl(s3, cmd, { expiresIn: URL_TTL_SECONDS });
}

async function presignGet(key) {
  const cmd = new GetObjectCommand({ Bucket: process.env.B2_BUCKET, Key: key });
  return getSignedUrl(s3, cmd, { expiresIn: URL_TTL_SECONDS });
}

async function getObject(key) {
  const cmd = new GetObjectCommand({ Bucket: process.env.B2_BUCKET, Key: key });
  const response = await s3.send(cmd);
  return response;
}

async function putObject(key, body, contentType) {
  await s3.send(
    new PutObjectCommand({
      Bucket: process.env.B2_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
}

module.exports = { configured, s3, presignPut, presignGet, getObject, putObject };
