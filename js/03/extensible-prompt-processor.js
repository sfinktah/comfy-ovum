// Frontend extension for ExtensiblePromptProcessor
// Mirrors the behavior used for ImpactWildcardProcessor/ImpactWildcardEncode
app.registerExtension({
	name: "Comfy.ExtensiblePrompt",
	nodeCreated(node, app) {
		if (node.comfyClass == "ExtensiblePromptProcessor") {
			node._wvalue = "Select the Wildcard to add to the text";

			let tbox_id = 0;
			let combo_id = 4;
			const has_lora = false;

			// Wildcard combo -> append selected wildcard token into textbox
			if (node.widgets && node.widgets[combo_id + 1]) {
				node.widgets[combo_id + 1].callback = (value, canvas, node, pos, e) => {
					if (node) {
						if (node.widgets[tbox_id].value != "") node.widgets[tbox_id].value += ", ";
						node.widgets[tbox_id].value += node._wildcard_value;
						if (node.widgets_values) {
							node.widgets_values[tbox_id] = node.widgets[tbox_id].value;
						}
					}
				};

				Object.defineProperty(node.widgets[combo_id + 1], "value", {
					set: (value) => {
						if (value !== "Select the Wildcard to add to the text") node._wildcard_value = value;
					},
					get: () => {
						return "Select the Wildcard to add to the text";
					},
				});

				// Populate combo options from wildcards_list (provided by backend)
				Object.defineProperty(node.widgets[combo_id + 1].options, "values", {
					set: (_x) => {},
					get: () => {
						return wildcards_list;
					},
				});

				// Prevent validation errors
				node.widgets[combo_id + 1].serializeValue = () => {
					return "Select the Wildcard to add to the text";
				};
			}

			// Placeholders and mode UI
			if (node.widgets && node.widgets[0] && node.widgets[1]) {
				node.widgets[0].inputEl.placeholder = "Wildcard Prompt (User input)";
				node.widgets[1].inputEl.placeholder = "Populated Prompt (Will be generated automatically)";
				node.widgets[1].inputEl.disabled = true;
			}

			const populated_text_widget = node.widgets?.find((w) => w.name == "populated_text");
			const mode_widget = node.widgets?.find((w) => w.name == "mode");

			// Mode combo: disable populated_text in 'populate' mode, enable in 'fixed'
			if (mode_widget && populated_text_widget) {
				Object.defineProperty(mode_widget, "value", {
					set: (value) => {
						if (value == true) node._mode_value = "populate";
						else if (value == false) node._mode_value = "fixed";
						else node._mode_value = value; // combo value

						populated_text_widget.inputEl.disabled = node._mode_value == "populate";
					},
					get: () => {
						if (node._mode_value != undefined) return node._mode_value;
						else return "populate";
					},
				});
			}
		}
	},
});
