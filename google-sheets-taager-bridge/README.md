# Taager Google Sheets Bridge

This is the customer-friendly flow:

1. Customer creates or opens a Google Sheet.
2. Customer opens `Extensions > Apps Script`.
3. Paste `Code.gs`.
4. Fill the official Taager endpoints in `CONFIG`.
5. Run the sheet menu `Taager Sync > Set Integration Token`.
6. Run `Taager Sync > Sync Now`.
7. The app reads the `Taager Products` and `Taager Orders` tabs.

The token is not decoded. Apps Script stores it in `PropertiesService` and sends it to Taager as an API credential.

Questions to ask Taager:

- What is the products endpoint URL for Apps Script?
- What is the orders endpoint URL for Apps Script?
- Is the token sent as `Authorization: Bearer TOKEN`, `x-api-key: TOKEN`, or in the JSON body?
- Does the orders endpoint support date filters?
- Does the products endpoint include categories, prices, stock, and SKUs?
- What are the rate limits and token expiry rules?

Once those answers are known, update `CONFIG` and the `fetchTaagerList` request method/body if needed.
