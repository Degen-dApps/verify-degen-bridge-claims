# Script to verify Degen Chain Bridge claims

### Install packagase

```bash
npm install
```

### API key

Important: You need Airstack API key to run this script. Get one here: https://app.airstack.xyz/profile-settings/api-keys 

Once you have the API key, rename the `.env.example` file into `.env` file and enter the API key there.

### Data

Currently there's a test claims CSV file in the `data` folder, for testing purposes.

Once you have the real claims CSV file, import it into the `data` folder and update this line in `index.js`:

```js
const filePath = './data/test-claims.csv';
```

### Run the script

```bash
npm run start
```

### Results

Once the script completes, two new files will appear in the `results` folder. One CSV file contains all claims (valid and non-valid), 
while the other CSV file contains only valid claims.

If there are any issues with any of the claims, there will be a **note** for it in the results data. Notes will tell you more what 
may be wrong with a claim and what to investigate further.