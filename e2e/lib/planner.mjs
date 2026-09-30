/** Gemeinsame Test-Helfer für die Planer-Oberfläche. */

/** Möbel über die Bibliothek hinzufügen (öffnen → Karte anklicken; Bibliothek schließt sich). */
export async function addFurniture(page, type) {
  await page.getByTestId('furniture-library-button').click();
  await page.getByTestId(`library-item-${type}`).click();
  await page.getByTestId('furniture-library').waitFor({ state: 'detached' });
}
