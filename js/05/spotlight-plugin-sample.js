import {app} from "../../../scripts/app.js";

// Sample ComfyUI node extension that registers spotlight search providers
app.registerExtension({
    name: "ovum.spotlight.sample-provider",
    setup () {
        // Register keyword handler: "sample"
        window.OvumSpotlight?.registerKeywordHandler("sample", (text, ctx) => {
            const items = [];
            // Build trivial items from nodes whose title contains the text
            const nodes = ctx.collectAllNodesRecursive();
            for (const {node, displayId, parentChain} of nodes) {
                const t = (node.title || node.type || "").toLowerCase();
                if (!text || t.includes(text.toLowerCase())) {
                    items.push({
                        type: "node",
                        id: displayId,
                        title: `${node.title || node.type}  [${displayId}]`,
                        sub: "sample-match",
                        node,
                        parentChain,
                        searchText: `${node.title || node.type} ${displayId}`
                    });
                }
            }
            return {items};
        });

        // Register default handler to:
        // 1) add a help command item
        // 2) contribute node items whose combobox widgets' current value matches the query
        // Note: Spotlight core will run FZF using each item's searchText; since default handlers
        // are not given the query directly, we include combobox values in searchText so they can match.
        window.OvumSpotlight?.registerDefaultHandler((ctx) => {
            const items = [];

            // Help/command item
            items.push({
                type: "command",
                id: "sample-help",
                title: "Sample Spotlight Provider: type 'sample <text>'",
                sub: "demo",
                searchText: "sample spotlight help",
                onSelect: () => {
                    app.extensionManager.toast.add({
                        severity: 'info',
                        summary: "Sample Spotlight Provider: type 'sample <text>'",
                        life: 5000,
                    });
                }
            });

            // Combobox search contribution: iterate all nodes (including subgraphs)
            // This generates a lot of extra items, but it's a good example of how to do things
            if (false) {
                const nodes = ctx.collectAllNodesRecursive();
                for (const {node, displayId, parentChain} of nodes) {
                    if (!Array.isArray(node.widgets)) {
                        continue;
                    }
                    for (const w of node.widgets) {
                        // Heuristics to detect combobox-like widgets in ComfyUI:
                        // - w.type === 'combo' (common), or
                        // - w.options is an array or object of allowed values.
                        const isCombo = (w && (w.type === 'combo' || Array.isArray(w.options) || (w.options && typeof w.options === 'object')));
                        if (!isCombo) {
                            continue;
                        }
                        const valueStr = String(w.value ?? "");
                        const nameStr = String(w.name ?? "Combo");

                        // Contribute an item per combobox widget so that FZF can match its value.
                        // searchText includes node identity plus the combobox name and current value.
                        items.push({
                            type: "node",
                            id: displayId,
                            title: `${node.title || node.type}  #${displayId}`,
                            // sub: `${nameStr}: ${valueStr}`,
                            sub: "Sample ComboBox Handler",
                            node,
                            parentChain,
                            searchText: `${node.title || node.type} ${node.type || ''} ${displayId} ${nameStr} ${valueStr}`
                        });
                    }
                }

                return {items};
            }
        });
    }
});
