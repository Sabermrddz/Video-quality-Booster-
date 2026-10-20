#!/usr/bin/env node
/**
 * Setup B2 CORS configuration
 * Run: node setup-b2-cors.js
 */

const { S3Client, PutBucketCorsCommand } = require('@aws-sdk/client-s3');

require('dotenv').config();

const s3 = new S3Client({
  region: process.env.B2_REGION,
  endpoint: process.env.B2_ENDPOINT,
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.B2_KEY_ID,
    secretAccessKey: process.env.B2_APP_KEY,
  },
});

const corsRules = {
  CORSRules: [
    {
      AllowedOrigins: [
        'https://gans-35d5f7fbdffd.herokuapp.com',
        'http://localhost:3000',
      ],
      AllowedMethods: ['GET', 'HEAD'],
      AllowedHeaders: ['*'],
      ExposeHeaders: [
        'ETag',
        'Content-Length',
        'Content-Type',
        'x-amz-request-id',
        'x-amz-id-2',
      ],
      MaxAgeSeconds: 3600,
    },
  ],
};

async function setupCORS() {
  try {
    const command = new PutBucketCorsCommand({
      Bucket: process.env.B2_BUCKET,
      CORSConfiguration: corsRules,
    });

    await s3.send(command);
    console.log('✅ B2 CORS configuration updated successfully!');
    console.log('Allowed origins:', corsRules.CORSRules[0].AllowedOrigins);
    console.log('Allowed methods:', corsRules.CORSRules[0].AllowedMethods);
  } catch (error) {
    console.error('❌ Failed to setup CORS:', error.message);
    console.error('\nMake sure your .env file has:');
    console.error('- B2_KEY_ID');
    console.error('- B2_APP_KEY');
    console.error('- B2_BUCKET');
    console.error('- B2_ENDPOINT');
    console.error('- B2_REGION');
    process.exit(1);
  }
}

setupCORS();
