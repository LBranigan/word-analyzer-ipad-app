import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

admin.initializeApp();

export const processAssessment = functions.storage
  .object()
  .onFinalize(async (object) => {
    // Will be implemented in Task 2
    console.log('File uploaded:', object.name);
  });
