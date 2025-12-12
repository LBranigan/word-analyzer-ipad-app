# Word Analyzer - Compliance Documentation

This folder contains all required compliance documentation for FERPA (Family Educational Rights and Privacy Act), COPPA (Children's Online Privacy Protection Act), and Washington State's SUPER Act (Student User Privacy in Education Rights).

## Document Overview

| Document | Purpose | Audience |
|----------|---------|----------|
| [PRIVACY-POLICY.md](./PRIVACY-POLICY.md) | Required online privacy notice | Public (post on website) |
| [DIRECT-NOTICE-TO-SCHOOLS.md](./DIRECT-NOTICE-TO-SCHOOLS.md) | Required COPPA notice before data collection | Schools (provide before use) |
| [SCHOOL-CONSENT-FORM.md](./SCHOOL-CONSENT-FORM.md) | Verifiable consent form | Schools (sign and return) |
| [DATA-RETENTION-POLICY.md](./DATA-RETENTION-POLICY.md) | Written data retention policy | Internal / Schools on request |
| [INFORMATION-SECURITY-PROGRAM.md](./INFORMATION-SECURITY-PROGRAM.md) | Written security program | Internal / Schools on request |
| [PARENT-RIGHTS-NOTICE.md](./PARENT-RIGHTS-NOTICE.md) | Parent-friendly rights explanation | Parents (schools distribute) |
| [DATA-FLOW-DIAGRAM.md](./DATA-FLOW-DIAGRAM.md) | Technical data flow documentation | Technical / Compliance review |

---

## Third-Party Services Used

Word Analyzer uses **exclusively Google Cloud services** for all data processing. This simplifies FERPA compliance as most schools already have Google Cloud/Workspace Data Processing Agreements in place.

| Service | Data Processed | Purpose |
|---------|----------------|---------|
| **Google Cloud Speech-to-Text** | Audio recordings | Transcribe student reading |
| **Google Cloud Vision** | Images of text | Extract text via OCR |
| **Google Cloud Text-to-Speech** | AI summary text | Generate voice feedback |
| **Google Gemini AI** | Assessment metrics | Generate personalized summaries |
| **Firebase/Firestore** | All assessment data | Secure data storage |
| **Firebase Storage** | Temporary media files | Audio/video/image storage |
| **Firebase Auth** | Teacher accounts | User authentication |

**Privacy Advantage:** Using only Google services means:
- Schools typically have existing Google Cloud DPAs
- Single vendor for compliance review
- No third-party AI services with separate privacy policies
- Data stays within Google's infrastructure

---

## Compliance Checklist

### Before a School Uses Word Analyzer

- [ ] Verify school has Google Cloud/Workspace DPA in place
- [ ] Provide school with **Direct Notice to Schools** document
- [ ] Provide school with **Privacy Policy** link
- [ ] Obtain signed **School Consent Form**
- [ ] Keep signed consent form on file
- [ ] Confirm school will notify parents of app usage

### Ongoing Compliance

- [ ] Privacy Policy posted publicly and linked in app
- [ ] Respond to parent access/deletion requests within 30 days
- [ ] Review and update policies annually
- [ ] Monitor for material changes requiring updated consent

### If Privacy Policy Changes

- [ ] Update Privacy Policy with new effective date
- [ ] Send updated Direct Notice to all schools
- [ ] Obtain new consent if changes are material

---

## Placeholders to Complete

Before using these documents, fill in all `[PLACEHOLDER]` sections:

| Placeholder | Description | Example |
|-------------|-------------|---------|
| `[OPERATOR_NAME]` | Legal name of company/individual | "Morningside Academy" |
| `[OPERATOR_ADDRESS]` | Physical mailing address | "123 Main St, Seattle, WA 98101" |
| `[OPERATOR_EMAIL]` | Contact email for privacy inquiries | "privacy@example.com" |
| `[OPERATOR_PHONE]` | Contact phone number | "(206) 555-1234" |
| `[EFFECTIVE_DATE]` | Date policies take effect | "January 1, 2025" |
| `[LAST_UPDATED]` | Date of last update | "December 12, 2025" |
| `[WEBSITE_URL]` | URL where app is hosted | "https://example.com/word-analyzer" |

---

## Legal Basis

These documents are designed to comply with:

1. **FERPA** - Family Educational Rights and Privacy Act (20 U.S.C. 1232g)
   - [Department of Education FERPA Page](https://www2.ed.gov/policy/gen/guid/fpco/ferpa/index.html)

2. **COPPA** - Children's Online Privacy Protection Act (16 CFR Part 312)
   - [FTC COPPA Rule](https://www.ftc.gov/legal-library/browse/rules/childrens-online-privacy-protection-rule-coppa)
   - [FTC COPPA FAQ](https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions)

3. **2025 COPPA Rule Updates** (effective June 23, 2025)
   - Requires written data retention policy
   - Requires written information security program
   - Enhanced disclosure requirements

4. **Washington SUPER Act** (RCW 28A.604)
   - [Full Text](https://app.leg.wa.gov/RCW/default.aspx?cite=28A.604&full=true)
   - Applies to school service providers in Washington State

---

## Important Notes

### This is NOT Legal Advice

These documents are templates based on publicly available compliance requirements. They should be reviewed by a qualified attorney before use. The author is not responsible for any legal issues arising from use of these documents.

### School Consent Authority

Under COPPA, schools may consent on behalf of parents **only** when:
- Data is used solely for educational purposes
- Data is not used for commercial purposes (advertising, profiling, etc.)
- The school has been provided with all required notices
- Parents are informed of the school's consent

### FERPA "School Official" Exception

Under FERPA, schools may share education records with "school officials" (including contractors) who:
- Perform institutional services or functions
- Have a legitimate educational interest
- Are under direct control of the school regarding use of records
- Follow the same privacy conditions as school employees

Word Analyzer qualifies as a "school official" when schools use it for legitimate educational assessment purposes.

---

## Contact

For questions about this compliance documentation:

**[OPERATOR_NAME]**
[OPERATOR_ADDRESS]
Email: [OPERATOR_EMAIL]
Phone: [OPERATOR_PHONE]
