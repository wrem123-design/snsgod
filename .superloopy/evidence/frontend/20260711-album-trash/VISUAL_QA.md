# Album trash visual QA

## Automated and static evidence

- PASS: normal album grid still has no permanent delete button.
- PASS: per-reference unlink explains that other shared owners and the source file remain.
- PASS: multi-trash preview names image, reference, character, and room impact counts.
- PASS: trash view has explicit empty state, restore, and permanent-delete actions with 42px targets.
- PASS: permanent delete requires two native confirmations and distinguishes managed from external files.
- PASS: restore copy explains conflicts and never claims that newer values were overwritten.
- PASS: no new raw color literal, gradient, glow, decorative emoji, glass card, fake metric, or placeholder identity was introduced.

## Device evidence

- PENDING FINAL DEVICE RUN: native Android layout, copied-data trash/restore, app restart, and TalkBack will be verified on the user-provided device after the final release APK is installed.
