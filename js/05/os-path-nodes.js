import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";
import {chainCallback} from "../01/utility.js";

function updateWidgetDisabled(node, inputName, widgetName){
    try{
        const slotIndex = node.findInputSlot(inputName);
        const isLinked = slotIndex >= 0 && node.inputs?.[slotIndex]?.link != null;
        const w = node.widgets?.find(w=>w.name===widgetName);
        if (w) w.computeDisabled = !!isLinked;
        if (node.canvas?.setDirty) app.canvas.setDirty(true,true);
    }catch(e){console.warn("[ovum] os-path-nodes updateWidgetDisabled error", e)}
}

app.registerExtension({
    name:"ovum.ospath.widgets",
    nodeCreated(node){
        const title = node?.title||"";
        if (title.startsWith("os.path.") || title==="Backslashes → Forward" || title==="STRING to PATHLIKE (PurePath)" || title==="Combine Paths"){
            node.onConnectionsChange = (slotType, slot, isConnected, link_info)=>{
                if (slotType === LiteGraph.INPUT){
                    // try common names
                    updateWidgetDisabled(node, "path_in", "path");
                    updateWidgetDisabled(node, "a_in", "a");
                    updateWidgetDisabled(node, "b_in", "b");
                    updateWidgetDisabled(node, "c_in", "c");
                    updateWidgetDisabled(node, "d_in", "d");
                    updateWidgetDisabled(node, "path1_in", "path1");
                    // combine paths list inputs don't disable string widgets intentionally
                }
            };
        }
        if (title === "Combine Paths"){
            const addIfLastLinked = ()=>{
                try{
                    const candidates = ["path1_in","path2_in","path3_in","path4_in"];
                    for (let i=0;i<candidates.length;i++){
                        const name=candidates[i];
                        const idx = node.findInputSlot(name);
                        const linked = idx>=0 && node.inputs?.[idx]?.link!=null;
                        if (i===candidates.length-1 && linked){
                            // add another pair of inputs dynamically
                            const next = `path${i+2}`;
                            if (node.findInputSlot(next)===-1){
                                node.addInput(next, "STRING");
                                node.addInput(next+"_in", "LIST");
                                if (node.canvas?.setDirty) app.canvas.setDirty(true,true);
                            }
                        }
                    }
                }catch(e){console.warn("[ovum] Combine Paths auto-add error", e)}
            };
            node.onConnectionsChange = (slotType, slot, isConnected, link_info)=>{
                if (slotType===LiteGraph.INPUT) addIfLastLinked();
            };
        }
    }
});
