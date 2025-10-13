// console.log(comfyAPI.ui.$el + '')
function $el (tag2, propsOrChildren, children) {
    const split2 = tag2.split(".");
    const element2 = document.createElement(split2.shift());
    if (split2.length > 0) {
        element2.classList.add(...split2);
    }
    if (propsOrChildren) {
        if (typeof propsOrChildren === "string") {
            propsOrChildren = {textContent: propsOrChildren};
        } else if (propsOrChildren instanceof Element) {
            propsOrChildren = [propsOrChildren];
        }
        if (Array.isArray(propsOrChildren)) {
            element2.append(...propsOrChildren);
        } else {
            const {
                parent: parent2,
                $: cb,
                dataset,
                style: style2,
                ...rest2
            } = propsOrChildren;
            if (rest2.for) {
                element2.setAttribute("for", rest2.for);
            }
            if (style2) {
                Object.assign(element2.style, style2);
            }
            if (dataset) {
                Object.assign(element2.dataset, dataset);
            }
            Object.assign(element2, rest2);
            if (children) {
                element2.append(...Array.isArray(children) ? children : [children]);
            }
            if (parent2) {
                parent2.append(element2);
            }
            if (cb) {
                cb(element2);
            }
        }
    }
    return element2;
}