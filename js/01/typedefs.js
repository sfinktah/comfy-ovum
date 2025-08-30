
/**
 * @typedef {Object} ComfyNodeSimple
 * @property {string} type
 * @property {string} name
 * @property {string} title
 * @property {Array<any>} widgets
 * @property {Array<number>} size
 * @property {function} addWidget
 * @property {function} addCustomWidget
 * @property {function} addDOMWidget
 * @property {function} onRemoved
 * @property {HTMLElement} widget_area
 * @property {boolean} serialize_widgets
 */

/**
 * @typedef {Object} WebSocketLike
 * @property {string} url
 * @property {number} readyState
 * @property {number} bufferedAmount
 * @property {?function} onopen
 * @property {?function} onerror
 * @property {?function} onclose
 * @property {string} extensions
 * @property {string} protocol
 * @property {?function} onmessage
 * @property {string} binaryType
 * @property {number} CONNECTING
 * @property {number} OPEN
 * @property {number} CLOSING
 * @property {number} CLOSED
 * @property {function():void} close
 * @property {function(*):void} send
 * @property {function():void} constructor
 * @property {function(string, function, boolean=):void} addEventListener
 * @property {function(Event):boolean} dispatchEvent
 * @property {function(string, function, boolean=):void} removeEventListener
 * @property {function(string):Promise} when
 */

/**
 * @typedef {Object} SetLike
 * @property {function(any):boolean} has
 * @property {function(any):SetLike} add
 * @property {function(any):boolean} delete
 * @property {function(SetLike):SetLike} difference
 * @property {function():void} clear
 * @property {function():IterableIterator<Array>} entries
 * @property {function(function, *):void} forEach
 * @property {function(SetLike):SetLike} intersection
 * @property {function(SetLike):boolean} isSubsetOf
 * @property {function(SetLike):boolean} isSupersetOf
 * @property {function(SetLike):boolean} isDisjointFrom
 * @property {number} size
 * @property {function(SetLike):SetLike} symmetricDifference
 * @property {function(SetLike):SetLike} union
 * @property {function():IterableIterator<any>} values
 * @property {function():IterableIterator<any>} keys
 * @property {function():void} constructor
 */

/**
 * @typedef {Object} ComfyApiLike
 * @property {string} api_host
 * @property {string} api_base
 * @property {string} initialClientId
 * @property {string} clientId
 * @property {*} user
 * @property {WebSocketLike} socket
 * @property {SetLike} reportedUnknownMessageTypes
 * @property {function(number, any):Promise<any>} queuePrompt
 * @property {function():Promise<any>} getNodeDefs
 * @property {function(string):string} apiURL
 * @property {function():void} interrupt
 * @property {function():void} constructor
 * @property {function(string):string} internalURL
 * @property {function(string):string} fileURL
 * @property {function(string, Object=):Promise<any>} fetchApi
 * @property {function(string, function, Object=):void} addEventListener
 * @property {function(string, function, Object=):void} removeEventListener
 * @property {function(string, any, boolean=, boolean=, boolean=):void} dispatchCustomEvent
 * @property {function(Event):boolean} dispatchEvent
 * @property {function():Promise<any>} init
 * @property {function():Promise<any>} getExtensions
 * @property {function():Promise<any>} getWorkflowTemplates
 * @property {function():Promise<any>} getCoreWorkflowTemplates
 * @property {function():Promise<any>} getEmbeddings
 * @property {function():Promise<any>} getModelFolders
 * @property {function(string):Promise<any>} getModels
 * @property {function(string, string):Promise<any>} viewMetadata
 * @property {function(string):Promise<any>} getItems
 * @property {function():Promise<any>} getQueue
 * @property {function(number=):Promise<any>} getHistory
 * @property {function():Promise<any>} getSystemStats
 * @property {function(string, any):Promise<any>} deleteItem
 * @property {function(string):Promise<any>} clearItems
 * @property {function():Promise<any>} getUserConfig
 * @property {function(string):Promise<any>} createUser
 * @property {function():Promise<any>} getSettings
 * @property {function(string):Promise<any>} getSetting
 * @property {function(Object):Promise<any>} storeSettings
 * @property {function(string, any):Promise<any>} storeSetting
 * @property {function(string, Object=):Promise<any>} getUserData
 * @property {function(string, any, Object=):Promise<any>} storeUserData
 * @property {function(string):Promise<any>} deleteUserData
 * @property {function(string, string, Object=):Promise<any>} moveUserData
 * @property {function(string):Promise<any>} listUserDataFullInfo
 * @property {function():Promise<any>} getLogs
 * @property {function():Promise<any>} getRawLogs
 * @property {function(boolean):void} subscribeLogs
 * @property {function():Promise<any>} getFolderPaths
 * @property {function():Promise<any>} getCustomNodesI18n
 * @property {function():Promise<any>} when
 */

/**
 * @typedef {Object} ComfyTickEvent
 * @property {boolean} isTrusted
 * @property {number} detail
 * @property {function(string=, any=, boolean=, boolean=, boolean=):void} initCustomEvent
 * @property {function():void} constructor
 * @property {string} type
 * @property {ComfyApiLike} target
 * @property {ComfyApiLike} currentTarget
 * @property {number} eventPhase
 * @property {boolean} bubbles
 * @property {boolean} cancelable
 * @property {boolean} defaultPrevented
 * @property {boolean} composed
 * @property {number} timeStamp
 * @property {ComfyApiLike} srcElement
 * @property {boolean} returnValue
 * @property {boolean} cancelBubble
 * @property {number} NONE
 * @property {number} CAPTURING_PHASE
 * @property {number} AT_TARGET
 * @property {number} BUBBLING_PHASE
 * @property {function():Array<EventTarget>} composedPath
 * @property {function(string, boolean=, boolean=):void} initEvent
 * @property {function():void} preventDefault
 * @property {function():void} stopImmediatePropagation
 * @property {function():void} stopPropagation
 */
