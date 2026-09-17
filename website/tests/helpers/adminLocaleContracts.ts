import ts from "typescript";

/** Regression contract: copy edits cannot silently alter API enums, queries or option submissions. */
export function adminLocaleContract(code: string, file: string): string[] {
  const source = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true);
  const entries: string[] = [];
  const machineProps = new Set(["status", "value", "role", "type", "method", "action", "mode", "payment_method", "payment_status", "escrow_status", "seller_payout_status", "severity", "code", "id", "href", "src", "currency"]);
  const machineCalls = /^(?:setStatus|setRole|setType|setMode|setAction|setPaymentStatus|setEmploymentStatus)$|\.(?:from|select|eq|neq|in|order|addEventListener|removeEventListener|getItem|setItem)$/;
  function value(node: ts.Node): string {
    if (ts.isJsxExpression(node)) return node.expression ? value(node.expression) : "";
    return ts.isStringLiteral(node) || ts.isJsxText(node)
      ? "text:" + node.text.replace(/\s+/g, " ").trim()
      : node.getText(source).replace(/\s+/g, " ");
  }
  function visit(node: ts.Node) {
    if (ts.isBinaryExpression(node) && [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken, ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsToken].includes(node.operatorToken.kind)) {
      for (const item of [node.left, node.right]) if (ts.isStringLiteral(item)) entries.push("compare:" + item.text);
    }
    if (ts.isLiteralTypeNode(node) && ts.isStringLiteral(node.literal)) entries.push("type:" + node.literal.text);
    if (ts.isPropertyAssignment(node) && machineProps.has(node.name.getText(source).replace(/["']/g, "")) && (ts.isStringLiteral(node.initializer) || ts.isNumericLiteral(node.initializer))) entries.push("property:" + node.name.getText(source).replace(/["']/g, "") + ":" + value(node.initializer));
    if (ts.isCallExpression(node) && machineCalls.test(node.expression.getText(source))) for (const argument of node.arguments) if (ts.isStringLiteral(argument)) entries.push("call:" + node.expression.getText(source).split(".").at(-1) + ":" + argument.text);
    if (ts.isJsxElement(node) && node.openingElement.tagName.getText(source) === "option") {
      const attribute = node.openingElement.attributes.properties.find((item): item is ts.JsxAttribute => ts.isJsxAttribute(item) && item.name.getText(source) === "value");
      if (attribute?.initializer) entries.push("option:" + value(attribute.initializer));
      else {
        const children = node.children.filter(item => !ts.isJsxText(item) || item.text.trim());
        if (children.length === 1) entries.push("option:" + value(children[0]));
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return entries.sort();
}
