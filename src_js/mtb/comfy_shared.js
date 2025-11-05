/**
 * @module Shared utilities
 * File: comfy_shared.js
 * Project: comfy_mtb
 * Author: Mel Massadian
 * Copyright (c) 2023-2024 Mel Massadian
 *
 * This file re-exports utilities from modular files for backwards compatibility
 */

// Reference the shared typedefs file
/// <reference path="../types/typedefs.js" />

// Re-export base utilities
export {
    makeUUID,
    LocalStorageManager,
    infoLogger,
    warnLogger,
    errorLogger,
    successLogger,
    log,
    deepMerge
} from './utils/base.js'

// Re-export widget utilities
export {
    CONVERTED_TYPE,
    hideWidget,
    showWidget,
    convertToWidget,
    convertToInput,
    hideWidgetForGood,
    fixWidgets,
    inner_value_change,
    getNamedWidget,
    nodesFromLink,
    hasWidgets,
    cleanupNode,
    offsetDOMWidget,
    getWidgetType
} from './utils/widgets.js'

// Re-export dynamic connections
export {
    setupDynamicConnections,
    dynamic_connection
} from './utils/dynamic_connections.js'

// Re-export color utilities
export {
    isColorBright
} from './utils/colors.js'

// Re-export HTML/CSS utilities
export {
    calculateTotalChildrenHeight,
    loadScript
} from './utils/html.js'

// Re-export documentation widget
export {
    ensureMarkdownParser,
    addDocumentation
} from './utils/documentation.js'

// Re-export node extensions
export {
    extendPrototype,
    addMenuHandler,
    addDeprecation
} from './utils/node_extensions.js'

// Re-export Actions API
export {
    runAction,
    getServerInfo,
    setServerInfo
} from './utils/actions.js'

// Re-export Authoring API / graph utilities
export {
    getAPIInputs,
    getNodes
} from './utils/graph.js'
