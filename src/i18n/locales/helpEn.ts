export const helpEn = {
  'meta': {
    'title': 'Help — FuelBot'
  },
  'pageTitle': 'Help Center',
  'pageSubtitle': 'Common questions and step-by-step guides for using FuelBot.',
  'skipToFaq': 'Skip to FAQ',
  'skipToGuides': 'Skip to guides',
  'sectionFaq': 'Frequently asked questions',
  'sectionGuides': 'Step-by-step guides',
  'legalNote': 'This page explains how to use the app. For binding rules, see Terms and Privacy below.',
  'stillStuck': 'Still stuck?',
  'contactCta': 'Contact us — we will reply as soon as we can.',
  'guideNotFound': 'That help topic was not found.',
  'footerWebsite': 'Website',
  'links': {
    'authInline': 'Help with sign-in',
    'stationOwner': 'Station owner help',
    'garageInline': 'Fuel efficiency guide',
    'reportInline': 'Full reporting guide',
    'benefitsCta': 'Step-by-step help'
  },
  'faqGroups': {
    'accountTitle': 'Account & sign-in',
    'modesTitle': 'App modes (General / Station)',
    'reportingTitle': 'Reporting fuel',
    'stationTitle': 'Station owners'
  },
  'faq': {
    'account': {
      'q1': 'How do I create an account?',
      'a1': 'Open Sign up on the auth screen, enter your email and password, and accept the Terms. Check your inbox to confirm your email if asked.',
      'q2': 'I cannot sign in.',
      'a2': 'Check your password and email. Use Forgot password if needed. If email sign-in fails repeatedly, contact us with your email address.',
      'q3': 'I did not get the password reset email.',
      'a3': 'Check spam or promotions folders. Confirm you typed the correct email. Wait a few minutes and request again from Forgot password.',
      'q4': 'Why is my email not confirmed?',
      'a4': 'Open the confirmation link we sent when you signed up. If it expired, try signing up again or contact us so we can help.'
    },
    'modes': {
      'q1': 'What are General and Station owner modes?',
      'a1': 'General is for drivers: nearby list, map, reporting, and My Fleet fuel-efficiency tracking. Station owner is for verified station operators.',
      'q2': 'How do I switch mode?',
      'a2': 'Open the user menu (top right), find App mode, and choose the role you need. You only see extra modes if your account has access.',
      'q3': 'I see the wrong home screen.',
      'a3': 'Switch mode again in the user menu. Station tasks live under Station; fuel-efficiency tracking lives under My Fleet.'
    },
    'reporting': {
      'q1': 'Who can report?',
      'a1': 'Signed-in users in General mode can report. Location is usually required so reports match the right station.',
      'q2': 'How often can I report?',
      'a2': 'The app limits how often you can report the same station per day. Follow on-screen messages.',
      'q3': 'The station is missing from the list.',
      'a3': 'Use Suggest missing station from the report flow. After approval, you and others can report there.'
    },
    'station': {
      'q1': 'How do I manage my station?',
      'a1': 'Sign in, switch to Station owner mode, and open Station. You will see registration, payment, or dashboard based on your status.',
      'q2': 'What is the difference between register and claim?',
      'a2': 'Register adds a brand-new listing you operate. Claim is when the station already exists on the map and you prove you own it.',
      'q3': 'Payment is pending — what now?',
      'a3': 'Admin verifies payments. Wait for confirmation in the app. Use Inbox or Contact if it stays pending unusually long.',
      'q4': 'Where do I see subscription prices?',
      'a4': 'Always use the amounts shown on the payment screen in the app. We do not put fixed prices in help text because they can change.'
    }
  },
  'guides': {
    'reporting': {
      'title': 'Reporting fuel at a station',
      'prereq': 'Allow location when asked, or set your point on the map so we list the right nearby stations.',
      'seeAlsoSheet': 'On the report screen, tap ? for the same instructions while you report.',
      't1': 'If you are too far from the station, move closer or fix your map pin before submitting.'
    },
    'auth': {
      'title': 'Sign in and account',
      'prereq': 'Use an email inbox you can open. Use the same email each time.',
      's1': 'Open Sign in, enter email and password, then submit.',
      's2': 'New user? Switch to Sign up, accept Terms, then create your password.',
      's3': 'Forgot password? Use Forgot password — we email a reset link. Check spam and complete reset in the same browser when possible.',
      's4': 'If signup requires confirmation, open the link from FuelBot in your email.',
      's5': 'If mail does not arrive, verify the address, wait a few minutes, retry, or contact us.',
      't1': 'Reset link expired? Request a new email from Forgot password.',
      't2': 'Wrong dashboard? Open the user menu and switch App mode (General or Station owner).'
    },
    'mapModes': {
      'title': 'General and Station modes',
      'prereq': 'Open the user menu when your account has more than one role.',
      's1': 'General: nearby stations and reporting — typical for drivers.',
      's2': 'Station owner: manage your verified station, subscription, and official status.',
      's3': 'My Fleet: free fuel-efficiency tracking from the bottom navigation or user menu.',
      's4': 'If a mode is missing, you may need sign-in or station setup first.',
      's5': 'Wrong tab? Switch mode again — each mode opens its main screen.',
      't1': 'If Station mode is missing after approval, sign out and back in or contact support.',
      'relatedFleet': 'Benefits for fleet owners'
    },
    'stationRegister': {
      'title': 'Register a new fuel station',
      'prereq': 'Sign in, use Station owner mode, and know where the station is on the map.',
      's1': 'Open Station from the bottom navigation.',
      's2': 'Choose register new station; enter name, address, and accurate pin.',
      's3': 'Submit — admin may review before the listing is public.',
      's4': 'Pay when the app prompts you. Use only the instructions and amounts shown there.',
      's5': 'After payment, complete verification steps (name, brand, proof) if asked.',
      't1': 'Rejected or stuck? Contact us with station name and your account email.',
      'related': 'Why subscribe — station owner benefits'
    },
    'stationClaim': {
      'title': 'Claim an existing station listing',
      'prereq': 'Use this when the station already appears on the map and you truly operate it.',
      's1': 'Find the station on the map or list and open details.',
      's2': 'Start the claim flow from the station screen and follow identity steps.',
      's3': 'Upload or confirm anything admin requests.',
      's4': 'After approval, use Station mode for official updates.',
      't1': 'Wrong station or duplicate claim? Contact support with details.',
      'related': 'Station owner benefits'
    },
    'stationPayment': {
      'title': 'Station subscription payment',
      'prereq': 'You are in Station owner mode with a station that needs payment or renewal.',
      's1': 'Open Station and find payment or subscription.',
      's2': 'Follow live payment instructions (QR, reference, upload — whatever the app shows).',
      's3': 'Submit reference and screenshot if the form asks.',
      's4': 'Wait for admin confirmation; status updates in the app.',
      's5': 'When active, keep posting status so drivers see accurate fuel information.',
      't1': 'Never guess amounts — only use numbers from the in-app payment screen.',
      't2': 'Pending too long? Message us from Inbox or Contact.',
      'related': 'Station owner benefits'
    },
    'garageEfficiency': {
      'title': 'Fuel efficiency per vehicle (free)',
      'prereq': 'Sign in — no paid subscription required.',
      's1': 'Open My Fleet from the bottom navigation or user menu.',
      's2': 'Add a vehicle: manufacturer, model, year, fuel type. Nickname and region are optional but help you find it later.',
      's3': 'After each refuel, open the vehicle and Add fill-up: date, odometer (km), liters. Full-tank fills give the best L/100km.',
      's4': 'After two or more full-tank intervals, your average L/100km appears. Peer benchmarks show when enough anonymized data exists.',
      's5': 'Use My Fleet to see which vehicles burn too much fuel and improve your own records over time.',
      't1': 'Wrong odometer or partial fills can skew results — edit or delete a bad fill-up from the vehicle page.',
      't2': 'Plates are private and never shared in benchmarks.',
      'related': 'Benefits for fleet owners'
    }
  }
} as const
