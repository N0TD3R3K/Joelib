# JoeLang Studio launch checklist

- [ ] Verify the checked-out Git branch and review the Studio diff.
- [ ] Run `npm install` and `npm run check`.
- [ ] Confirm `derekli.dev` is the active Cloudflare zone.
- [ ] Ensure no unknown CNAME occupies `joelang-studio.derekli.dev`.
- [ ] Deploy with `npm run deploy`.
- [ ] Configure the Cloudflare Access OTP application and the four-domain allow policy.
- [ ] Confirm `workers.dev` is disabled for this Worker.
- [ ] Visit `https://joelang-studio.derekli.dev` using an allowed school address.
- [ ] Confirm an outside-domain address cannot obtain a usable login code.
- [ ] Create a local test file, refresh the page, and confirm it remains local to that browser.
- [ ] Test a second browser profile to confirm it begins with the standard Studio workspace.
- [ ] Keep the prior hosted URL available until the custom-domain test passes.

## Rollback

If a release fails, disable the Custom Domain binding or roll the Worker back
in Cloudflare, then keep the Access application in place until the exposure
decision has been reviewed. Do not loosen the email-domain policy as a shortcut.
