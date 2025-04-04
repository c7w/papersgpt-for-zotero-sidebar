import { config } from "../../package.json";
import Meet from "./Meet/api"
import Utils from "./utils";
import { Document } from "langchain/document";
import { help, fontFamily, defaultBuiltInTags, parseTag, defaultChatPrompt, defaultBuiltInPrompts } from "./base"
import { getLocalModelDownloadProgress, setApiKey, getSupportedLLMs, ModelConfig, selectModel } from "./Meet/papersgpt";
import { checkFileExist, startLocalLLMEngine, shutdownLocalLLMEngine } from "../hooks";
import { default_prompt_list, Prompt } from "./prompts";
import { newly_added_css } from "./views_css";
import { pdf2txt } from "./Meet/Zotero";


// var markdown = require('markdown-it')().use(require('markdown-it-mathjax3'));

const markdown = require("markdown-it")({
  breaks: true, // Convert line terminators \n to <br> tags
  xhtmlOut: true, // Use /> to close the tag, not >
  typographer: true,
  html: true,
});
const mathjax3 = require('markdown-it-mathjax3');
markdown.use(mathjax3);

export function sleep(time: number) {
    return new Promise((resolve) => window.setTimeout(resolve, time));
}

// Add CSS variables at the top of the file
const uiConfig = {
  primaryColor: "#59C0BC",
  secondaryColor: "#6C757D",
  successColor: "#28A745",
  dangerColor: "#DC3545",
  textColor: "#212529",
  bgColor: "rgba(255, 255, 255, 0.95)",
  shadow: `0px 3px 10px rgba(0, 0, 0, 0.1), 0px 16px 31px rgba(0, 0, 0, 0.1)`,
  borderRadius: "12px",
  transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)"
};

// Modify main container style
const containerStyles = {
  display: "none",
  flexDirection: "column",
  justifyContent: "flex-start",
  alignItems: "center",
  position: "fixed",
  width: Zotero.Prefs.get(`${config.addonRef}.width`) as string,
  fontSize: "18px",
  borderRadius: uiConfig.borderRadius,
  backgroundColor: uiConfig.bgColor,
  boxShadow: uiConfig.shadow,
  fontFamily: fontFamily,
  zIndex: "3",
  backdropFilter: "blur(8px)",
  border: "1px solid rgba(255, 255, 255, 0.2)"
};

// Modify tag style
const tagStyles = {
  display: "inline-block",
  flexShrink: "0",
  fontSize: "0.8em",
  height: "1.5em",
  color: `${uiConfig.primaryColor}`,
  backgroundColor: `rgba(89, 192, 188, 0.1)`,
  borderRadius: "1em",
  border: "1px solid rgba(89, 192, 188, 0.2)",
  margin: ".25em",
  padding: "0 .8em",
  cursor: "pointer",
  whiteSpace: "nowrap",
  transition: uiConfig.transition,
  "&:hover": {
    transform: "translateY(-1px)",
    boxShadow: "0 2px 8px rgba(89, 192, 188, 0.2)"
  }
};

// Modify input box style
const inputStyles = {
  width: "calc(100% - 5em)",
  height: "3em",
  borderRadius: "8px",
  border: "1px solid rgba(0, 0, 0, 0.1)",
  outline: "none",
  fontFamily: "Consolas",
  fontSize: "1em",
  padding: "0 1em",
  transition: uiConfig.transition,
  "&:focus": {
    borderColor: uiConfig.primaryColor,
    boxShadow: `0 0 0 2px ${uiConfig.primaryColor}33`
  }
};

// Modify button style
const buttonStyles = {
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  height: "3.2em",
  width: "3.2em",
  borderRadius: "8px",
  border: "none",
  backgroundColor: uiConfig.primaryColor,
  transition: uiConfig.transition,
  cursor: "pointer",
  "&:hover": {
    transform: "scale(1.05)",
    boxShadow: `0 2px 8px ${uiConfig.primaryColor}33`
  }
};

// 添加停止按钮样式
const stopButtonStyles = {
  display: "none", // 初始时隐藏
  justifyContent: "center",
  alignItems: "center",
  height: "3.2em",
  width: "3.2em",
  borderRadius: "8px",
  border: "none",
  backgroundColor: "#DC3545", // 使用危险色
  transition: uiConfig.transition,
  cursor: "pointer",
  "&:hover": {
    transform: "scale(1.05)",
    boxShadow: `0 2px 8px rgba(220, 53, 69, 0.3)`
  }
};

// Modify popup window style
const popupStyles = {
  backgroundColor: uiConfig.bgColor,
  borderRadius: uiConfig.borderRadius,
  boxShadow: uiConfig.shadow,
  padding: "1.5em",
  "&::before": {
    content: '""',
    position: "absolute",
    top: "-8px",
    left: "50%",
    transform: "translateX(-50%)",
    width: "16px",
    height: "16px",
    backgroundColor: "inherit",
    clipPath: "polygon(50% 0%, 0% 100%, 100% 100%)"
  }
};

export default class Views {
  private id = "papersgpt-for-zotero";
  /**
   * OpenAI interface historical message records need to be exposed to the GPT response function
   */
  public messages: { role: "user" | "assistant"; content: string }[] = [];
  /**
   * Used to store historical execution input, and use the up and down arrow keys to quickly recall
   */
  private _history: { input: string; output: string }[] = []
  /**
   * Used to store the last executed tag and use Ctrl + Enter to quickly execute it again
   */
  private _tag: Tag | undefined;
  /**
   * Record the id of the current GPT output stream setInterval to prevent there is still output after termination, which needs to be exposed to the GPT response function
   */
  public _ids: {type: "follow"| "output", id: number}[] = []

  public publisher2models: Map<string, ModelConfig> = new Map() 
  public publishers: string[] = []

  public supportedLanguages: string[] = []

  /**
   * Whether in note-taking environment
   */
  public isInNote: boolean = true
  public container!: HTMLDivElement;
  private toolbarContainer!: HTMLDivElement; 
  private inputContainer!: HTMLDivElement;
  private outputContainer!: HTMLDivElement;
  private dotsContainer!: HTMLDivElement;
  private tagsContainer!: HTMLDivElement;
  private utils: Utils;
  private isDarkMode: boolean = false
  private isInference: boolean = false 
  constructor() {
    this.utils = new Utils()
    this.registerKey()
    this.addStyle()

    // @ts-ignore
    window.Meet = Meet
    Meet.Global.views = this
    // Fix window.matchMedia may be null error
    this.isDarkMode = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)')?.matches || false;
  }

  private addStyle() {
    ztoolkit.UI.appendElement({
      tag: "style",
      id: `${config.addonRef}-style`,
      namespace: "html",
      properties: {
        innerHTML: `
          @keyframes loading {
            0%, 100%
            {
              opacity: 0.25;
            }
            50%
            {
              opacity: 0.8;
            }
          }
          #${this.id} .three-dots:hover {
            opacity: 0.8 !important;
          }
          #${this.id} .three-dots.loading .dot:nth-child(1) {
            animation-delay: 0s;
          }
          #${this.id} .three-dots.loading .dot:nth-child(2) {
            animation-delay: 0.5s;
          }
          #${this.id} .three-dots.loading .dot:nth-child(3) {
            animation-delay: 1s;
          }
          #${this.id} .three-dots.loading .dot {
            animation: loading 1.5s ease-in-out infinite;
          }
          #${this.id} ::-moz-selection {
            background: rgba(89, 192, 188, .8); 
            color: #fff;
          }
          #output-container * {
            font-family: ${fontFamily} !important;
          }
          #output-container div p, #output-container div span {
            marigin: 0;
            padding: 0;
            text-align: justify;
          }
          .gpt-menu-box .menu-item:hover, .gpt-menu-box .menu-item.selected{
            background-color: rgba(89, 192, 188, .23) !important;
	  }
	  .popover.show {
	    display: block;
	  }
          #${this.id} .tag {
            position: relative;
            overflow: hidden;
          }
          #${this.id} .ripple {
            left: 0;
            top: 50%;
            position: absolute;
            background: #fff;
            transform: translate(-50%, -50%);
            pointer-events: none;
            border-radius: 50%;
            animation: ripple 1.5s linear;
          }
          @keyframes ripple {
            from {
              width: 0px;
              height: 0px;
              opacity: 0.5;
            }
            to {
              width: 500px;
              height: 500px;
              opacity: 0;
            }
          }
        `
      },
    }, document.documentElement);

    ztoolkit.UI.appendElement({
      tag: "link",
      id: `${config.addonRef}-link`,
      properties: {
        type: "text/css",
        rel: "stylesheet",
        href: `chrome://${config.addonRef}/content/md.css`
      }
    }, document.documentElement)
  }

  /**
   * Corrected setText method to handle streaming responses
   */
  public setText(text: string, isDone: boolean = false, scrollToNewLine: boolean = true, isRecord: boolean = true) {
    this.updateWelcomeMessage(); // 添加这行
    const answer_div = document.querySelector("#sidebar-answer") as HTMLDivElement;
    
    // For streaming responses that aren't final
    if (!isDone) {
        // Find last assistant message
        const lastAssistantMessage = answer_div.querySelector('.assistant-message:last-child');
        if (lastAssistantMessage) {
            // Update existing message content
            const contentDiv = lastAssistantMessage.querySelector('.message-content');
            if (contentDiv) {
                contentDiv.setAttribute("pureText", text);
                contentDiv.innerHTML = markdown.render(text);
                if (scrollToNewLine) {
                    answer_div.scrollTop = answer_div.scrollHeight;
                }
                return;
            }
        }
        // Create new message container if none exists (only when there's content)
        else if (text.trim().length > 0) {
            this.createNewMessage(text, false);
        }
    }
    // For final assistant responses
    else {
        // Only create new assistant message if last message was from user
        if (this.messages.length > 0 && this.messages[this.messages.length - 1].role === 'user') {
            this.createNewMessage(text, true);
        }
        // Otherwise update last assistant message
        else {
            const lastAssistantMessage = answer_div.querySelector('.assistant-message:last-child');
            if (lastAssistantMessage) {
                const contentDiv = lastAssistantMessage.querySelector('.message-content');
                if (contentDiv) {
                    contentDiv.setAttribute("pureText", text);
                    contentDiv.innerHTML = markdown.render(text);
                }
            }
        }
    }

    if (scrollToNewLine) {
        answer_div.scrollTop = answer_div.scrollHeight;
    }
}

// New method to create messages
private createNewMessage(text: string, isUser: boolean) {
    const answer_div = document.querySelector("#sidebar-answer") as HTMLDivElement;
    const messageContainer = document.createElement('div');
    messageContainer.className = `chat-message ${isUser ? 'user-message' : 'assistant-message'}`;
    
    Object.assign(messageContainer.style, {
        marginBottom: '12px',
        padding: '8px',
        borderRadius: '8px',
        maxWidth: '85%',
        position: 'relative',
        alignSelf: isUser ? 'flex-end' : 'flex-start',
        marginLeft: isUser ? 'auto' : '0',
        backgroundColor: isUser ? '#e6f7ff' : '#f5f5f5',
        color: '#000'
    });

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content markdown-body';
    contentDiv.setAttribute("pureText", text);
    contentDiv.innerHTML = markdown.render(text);
    messageContainer.appendChild(contentDiv);

    answer_div.appendChild(messageContainer);
}

  private addDragEvent(node: HTMLDivElement) {
    let posX: number, posY: number
    let currentX: number, currentY: number
    let isDragging: boolean = false

    function handleMouseDown(event: MouseEvent) {
      // If it is an input or textarea element, skip the drag logic
      if (
        event.target instanceof window.HTMLInputElement ||
        event.target instanceof window.HTMLTextAreaElement ||
        event.target instanceof window.HTMLSelectElement ||
        (event.target as HTMLDivElement).classList.contains("tag")
      ) {
        return
      }
      posX = node.offsetLeft - event.clientX
      posY = node.offsetTop - event.clientY
      isDragging = true
    }

    function handleMouseUp(event: MouseEvent) {
      isDragging = false
    }

    function handleMouseMove(event: MouseEvent) {
      if (isDragging) {
        currentX = event.clientX + posX
        currentY = event.clientY + posY
        node.style.left = currentX + "px"
        node.style.top = currentY + "px"
      }
    }

    // Add event listeners
    node.addEventListener("mousedown", handleMouseDown)
    node.addEventListener("mouseup", handleMouseUp)
    node.addEventListener("mousemove", handleMouseMove)
  }


  private bindUpDownKeys(inputNode: HTMLInputElement) {
    inputNode.addEventListener("keydown", (e) => {
      this._history = this._history.filter(i=>i.input)
      let currentIdx = this._history.map(i=>i.input).indexOf(this.inputContainer!.querySelector("input")!.value)
      currentIdx = currentIdx == -1 ? this._history.length : currentIdx
      if (e.key === "ArrowUp") {
        currentIdx--;
        if (currentIdx < 0) {
          currentIdx = 0;
        }
        inputNode.value = this._history[currentIdx].input || "";
        this.setText(this._history[currentIdx].output, true, false, false)
      } else if (e.key === "ArrowDown") {
        currentIdx++;
        if (currentIdx >= this._history.length) {
          currentIdx = this._history.length;
          inputNode.value = "";
          this.outputContainer.style.display = "none"
        } else {
          inputNode.value = this._history[currentIdx].input || "";
          this.setText(this._history[currentIdx].output, true, false, false)
        }
      }
      if (["ArrowDown", "ArrowUp"].indexOf(e.key) >= 0) {
        e.stopPropagation();
        e.preventDefault();
        inputNode.setSelectionRange(inputNode.value.length, inputNode.value.length);
      }
    });
  }

  /**
   * Bind ctrl+scroll wheel to zoom in and out
   * @param div 
   */
  private bindCtrlScrollZoom(div: HTMLDivElement) {
      // Bind the wheel event to the specified div
    div.addEventListener('DOMMouseScroll', (event: any) => {
      // Check if the ctrl key is pressed
      if (event.ctrlKey || event.metaKey) {
        let _scale = div.style.transform.match(/scale\((.+)\)/)
        let scale = _scale ? parseFloat(_scale[1]) : 1
        let minScale = 0.5, maxScale = 2, step = 0.05
        if (div.style.bottom == "0px") {
          div.style.transformOrigin = "center bottom"
        } else {
          div.style.transformOrigin = "center center"
        }
        if (event.detail > 0) {
          // zoom out 
          scale = scale - step
          div.style.transform = `scale(${scale < minScale ? minScale : scale})`;
        } else {
          // zoom in
          scale = scale + step
          div.style.transform = `scale(${scale > maxScale ? maxScale : scale})`;
        }
      }
    })
  }

  /**
   * Bind the ctrl wheel to zoom in and out of all elements within the control
   * @param div
   */
  private bindCtrlScrollZoomOutput(div: HTMLDivElement) {
    const styleAttributes = {
      fontSize: 'font-size',
      lineHeight: 'line-height',
      marginBottom: 'margin-bottom',
      marginTop: 'margin-top',
      paddingBottom: 'padding-bottom',
      paddingTop: 'padding-top',
    } as const;
    type StyleAttributeKeys = keyof typeof styleAttributes;
    type StyleAttributes = {
      [K in StyleAttributeKeys]: string;
    };
    // Get the initial style of the child element
    const getChildStyles = (child: Element): StyleAttributes => {
      const style = window.getComputedStyle(child);
      const result: Partial<StyleAttributes> = {};
      for (const key in styleAttributes) {
        const typedKey = key as StyleAttributeKeys;
        result[typedKey] = style.getPropertyValue(styleAttributes[typedKey]);
      }
      return result as StyleAttributes;
    };
  
    // Update and apply styles to child elements
    const applyNewStyles = (child: HTMLElement, style: StyleAttributes, scale: number) => {
      const newStyle = (value: string) => parseFloat(value) * scale + 'px';
  
      for (const key in styleAttributes) {
        child.style && (child.style[key as StyleAttributeKeys] = newStyle(style[key as StyleAttributeKeys]))
      }
    };
    // Bind the wheel event to the specified div
    div.addEventListener('DOMMouseScroll', (event: any) => {
      const children = div.children[0].children;
      if (event.ctrlKey || event.metaKey) {
        const step = 0.05;
        event.preventDefault();
        event.stopPropagation();
        const scale = event.detail > 0 ? 1 - step : 1 + step;
        Array.from(children).forEach((child) => {
          const childElement = child as HTMLElement;
          const currentStyle = getChildStyles(child);
          applyNewStyles(childElement, currentStyle, scale);
        });
      }
    });
  }

  //! [c7w] TODO
  public createOrUpdateModelsContainer() {
    var curPublisher = Zotero.Prefs.get(`${config.addonRef}.usingPublisher`) as string
    const toolbarContainer = this.toolbarContainer
    if (toolbarContainer == null) {
      Zotero.Prefs.set(`${config.addonRef}.startLocalServer`, false)
      return 
    }

    // Only handle Customized publisher configuration
    if (curPublisher == "Customized") {
      const modelConfigContainer = toolbarContainer.querySelector(".model")! as HTMLDivElement
      
      // Remove existing containers if any
      const modelSelectDivContainer = toolbarContainer.querySelector(".modelSelectDivCSS")
      if (modelSelectDivContainer) {
        modelSelectDivContainer.remove()
      }

      var customModelDivContainer = toolbarContainer.querySelector(".customModelDiv")
      if (customModelDivContainer) {
        customModelDivContainer.remove()
      }

      var apiUrlContainer = toolbarContainer.querySelector(".apiUrlDiv") 
      if (apiUrlContainer) {
        apiUrlContainer.remove()
      }

      // Add API URL input
      apiUrlContainer = ztoolkit.UI.appendElement({
        tag: "div",
        id: "apiUrlDiv", 
        classList: ["apiUrlDiv"],
        styles: {
          margin: "6px",
          fontSize: "12px",
          borderRadius: "5px"
        }
      }, modelConfigContainer) as HTMLDivElement

      const curPublisherElement = this.publisher2models.get(curPublisher)
      const apiUrlInputContainer = ztoolkit.UI.appendElement({
        tag: "input",
        id: "apiUrl",
        classList: ["apiUrl"],
        properties: {
          type: "text",
          value: curPublisherElement?.apiUrl || "",
          placeholder: "Customized API URL"
        }
      }, apiUrlContainer) as HTMLDivElement

      if (this.isDarkMode) {
        apiUrlInputContainer.style.color = '#222';
      }

      apiUrlInputContainer.addEventListener("change", async event => {
        const curPublisherElement = this.publisher2models.get(curPublisher)
        if (curPublisherElement != null) {
          curPublisherElement.apiUrl = (<HTMLInputElement>apiUrlInputContainer).value
          Zotero.Prefs.set(`${config.addonRef}.usingModel`, (<HTMLInputElement>apiUrlInputContainer).value)
          Zotero.Prefs.set(`${config.addonRef}.usingAPIURL`, (<HTMLInputElement>apiUrlInputContainer).value)
          Zotero.Prefs.set(`${config.addonRef}.usingAPIKEY`, (<HTMLInputElement>apiUrlInputContainer).value)
        }
      })

      // Add Model Name input
      customModelDivContainer = ztoolkit.UI.appendElement({
        tag: "div",
        id: "customModelDiv",
        classList: ["customModelDiv"],
        styles: {
          margin: "6px",
          fontSize: "12px",
          borderRadius: "5px"
        }
      }, modelConfigContainer) as HTMLDivElement

      const customModelContainer = ztoolkit.UI.appendElement({
        tag: "input",
        id: "customModelId",
        properties: {
          type: "text",
          value: curPublisherElement?.models[0] || "",
          placeholder: "Customized Model Name"
        }
      }, customModelDivContainer) as HTMLDivElement

      if (this.isDarkMode) {
        customModelContainer.style.color = '#222';
      }

      customModelContainer.addEventListener("change", async event => {
        const curPublisherElement = this.publisher2models.get(curPublisher)
        if (curPublisherElement != null) {
          if (curPublisherElement.models.length > 0) {
            curPublisherElement.models[0] = (<HTMLInputElement>customModelContainer).value
          } else {
            curPublisherElement.models.push((<HTMLInputElement>customModelContainer).value)
          }
          Zotero.Prefs.set(`${config.addonRef}.customModelApiModel`, (<HTMLInputElement>customModelContainer).value)
          Zotero.Prefs.set(`${config.addonRef}.usingModel`, (<HTMLInputElement>customModelContainer).value)
        }
        Zotero.log(curPublisherElement)
        Zotero.log(Zotero.Prefs.get(`${config.addonRef}.usingModel`))
        Zotero.log(Zotero.Prefs.get(`${config.addonRef}.usingAPIURL`))
        Zotero.log(Zotero.Prefs.get(`${config.addonRef}.usingAPIKEY`))
      })
    }
  }

  //
  private buildContainer() {
    const container = ztoolkit.UI.createElement(document, "div", {
      tag: "div",
      id: this.id,
      styles: containerStyles
    });
    this.addDragEvent(container)
    this.bindCtrlScrollZoom(container)

    var curPublisher = Zotero.Prefs.get(`${config.addonRef}.usingPublisher`) as string
    var curModel =  Zotero.Prefs.get(`${config.addonRef}.usingModel`) as string

    // toolbar
    const toolbarContainer = this.toolbarContainer = ztoolkit.UI.appendElement({
      tag: "div",
      id: "toolbar-container",
      styles: {
        borderBottom: "1px solid #f6f6f6",
        width: "100%",
        display: "flex",
        alignItems: "center",
      },

      children: [
        {
          tag: "div",
	  id: "publishers",
          classList: ["publisher"],
          styles: {
            margin: "6px",
	    float: "left"
          }
        },
        {
	  tag: "div",
	  id: "models",
          classList: ["model"],
          styles: {
            margin: "6px",
	    float: "left"
          }
        },

	{
	  tag: "div",
	  id: "registers",
          classList: ["register"],
          styles: {
            marginLeft: "30%",
	    float: "right",
	    color: "blue",
	    fontSize: "20px"
          },
		 
	  children: [
            {
              tag: "img",
	      id: "registerImg",
              classList: ["registerImg"],
              styles: {
		width: "20px",
		height: "20px",
		backgroundColor: "#fff",
	      },
	      properties: {
	          src: `chrome://${config.addonRef}/content/icons/subscribe.png`
	      }
           }
	  ]
	  
	}

      ]
    }, container) as HTMLDivElement

    //create
    this.createOrUpdateModelsContainer()
    
    const registerContainer = toolbarContainer.querySelector(".register")! as HTMLDivElement
    
    registerContainer.addEventListener("mouseup", async event => {
        window.alert = function(msg, container) {

	    const backgroundContainer = ztoolkit.UI.createElement(
	      document, 
	      "div", 
	      "html", // 作为第三个参数
	      {  // 配置对象作为第四个参数
	        id: "languagesBg",
	        styles: {
                display: "block",
		flexDirection: "column",
		justifyContent: "flex-start",
		alignItems: "center",
		position: "fixed",
	        width: Zotero.Prefs.get(`${config.addonRef}.width`) as string,
		fontSize: "18px",
		borderRadius: "10px",
		backgroundColor: "#000",
		boxShadow: `0px 1.8px 7.3px rgba(0, 0, 0, 0.071),
		0px 6.3px 24.7px rgba(0, 0, 0, 0.112),
		0px 30px 90px rgba(0, 0, 0, 0.2)`,
		fontFamily: fontFamily,
		opacity: 0.6,
		zIndex: "2", 
              }
            })

            const subscriberShowContainer = ztoolkit.UI.createElement(document, "div", {
	      id: "subscriber",
	      styles: {
                display: "none",
	        //flexDirection: "column",
	        //justifyContent: "center",
		//alignItems: "center",
		position: "fixed",
		width: Zotero.Prefs.get(`${config.addonRef}.width`) as string,
		fontSize: "18px",
		borderRadius: "10px",
		backgroundColor: "#fff",
		boxShadow: `0px 1.8px 7.3px rgba(0, 0, 0, 0.071),
		0px 6.3px 24.7px rgba(0, 0, 0, 0.112),
		0px 30px 90px rgba(0, 0, 0, 0.2)`,
		fontFamily: fontFamily,
		zIndex: "3", 
	      },
            })

            const subscriberCloseContainer = ztoolkit.UI.appendElement({
			tag: "div",
			id: "subscriberClose",
			styles: {
			  display: "flex",
			  flexDirection: "column",
			  justifyContent: "flex-start",
			  //justifyContent: "center",
			  alignItems: "start",
			  position: "fixed",
			  //width: Zotero.Prefs.get(`${config.addonRef}.width`) as string,
			  fontSize: "15px",
			  borderRadius: "10px",
			  backgroundColor: "#fff",
			  boxShadow: `0px 1.8px 7.3px rgba(0, 0, 0, 0.071),
			  0px 6.3px 24.7px rgba(0, 0, 0, 0.112),
			  0px 30px 90px rgba(0, 0, 0, 0.2)`,
			  fontFamily: fontFamily,
			  color: "#1e90ff",
			  cursor: "pointer",
			  zIndex: "3", 
			  margin: "10px" 
			},
			properties: {
			  value: "",
			  innerHTML: "X" 
			}
	    }, subscriberShowContainer) as HTMLDivElement

            subscriberCloseContainer.addEventListener("click", async event => {
	         event.stopPropagation();
                 backgroundContainer.style.display = "none"
		 subscriberShowContainer.style.display = "none" 
            })


            const subscriberNoteContainer = ztoolkit.UI.appendElement({
		tag: "div",
		id: "subscriberNote",
		styles: {
		  display: "flex",
		  //flexDirection: "column",
	          justifyContent: "center",
		  position: "fixed",
		  width: Zotero.Prefs.get(`${config.addonRef}.width`) as string,
		  fontSize: "25px",
		  //borderRadius: "10px",
		  //backgroundColor: "#fff",
		  //boxShadow: `0px 1.8px 7.3px rgba(0, 0, 0, 0.071),
		  //0px 6.3px 24.7px rgba(0, 0, 0, 0.112),
		  //0px 30px 90px rgba(0, 0, 0, 0.2)`,
		  fontFamily: fontFamily,
		  //color: "#1e90ff",
		  //cursor: "pointer",
		  zIndex: "3", 
		  //margin: "10px" 
		},
		
		properties: {
		  value: "",
		  innerHTML: "Thank you for using PapersGPT!" 
		}
	    }, subscriberCloseContainer) as HTMLDivElement
	   
	    const grade = Zotero.Prefs.get(`${config.addonRef}.grade`) as string
	    const imgLink =  `chrome://${config.addonRef}/content/icons/` + grade + ".png"
            const subscriberGradeContainer = ztoolkit.UI.appendElement({
		tag: "img",
		id: "subscriberGrade",
		styles: {
		  display: "flex",
		  justifyContent: "center",
		  position: "fixed",
		  width: "64px",
		  height: "64px",
		  backgroundColor: "#fff",
		  margin: "50px"
		},
		
		properties: {
	          src: imgLink
		}
	    }, subscriberNoteContainer) as HTMLDivElement

            

	    const registerWrapContainer = ztoolkit.UI.createElement(document, "div", {
	      id: "registerWrap",
		  styles: {
                      display: "flex",
		      flexDirection: "column",
		      //justifyContent: "flex-start",
		      justifyContent: "center",
		      alignItems: "center",
		      position: "fixed",
		      width: Zotero.Prefs.get(`${config.addonRef}.width`) as string,
		      fontSize: "18px",
		      borderRadius: "10px",
		      backgroundColor: "#fff",
		      boxShadow: `0px 1.8px 7.3px rgba(0, 0, 0, 0.071),
		      0px 6.3px 24.7px rgba(0, 0, 0, 0.112),
		      0px 30px 90px rgba(0, 0, 0, 0.2)`,
		      fontFamily: fontFamily,
		      //cursor: "pointer",
		      //spacing: "20px", 
		      zIndex: "3", 

	          },
            })

        
            const subscribeContainer = ztoolkit.UI.appendElement({
	        tag: "input", 
		id: "subscribeInput",
	        styles: {
			display: "flex",
			flexDirection: "column",
			//justifyContent: "flex-start",
			justifyContent: "center",
			alignItems: "center",
			position: "fixed",
			width: Zotero.Prefs.get(`${config.addonRef}.width`) as string,
			fontSize: "15px",
			borderRadius: "10px",
			backgroundColor: "#fff",
			boxShadow: `0px 1.8px 7.3px rgba(0, 0, 0, 0.071),
			0px 6.3px 24.7px rgba(0, 0, 0, 0.112),
			0px 30px 90px rgba(0, 0, 0, 0.2)`,
			fontFamily: fontFamily,
			zIndex: "3", 

		},
		properties: {
		    type: "text",
	            placeholder: "Email" 
		}
            }, registerWrapContainer) as HTMLDivElement

            const subscribeWarnNoteContainer = ztoolkit.UI.appendElement({
	        tag: "div", 
		id: "subscribeWarnNote",
	        styles: {
			display: "none",
			flexDirection: "column",
			//justifyContent: "flex-start",
			justifyContent: "center",
			alignItems: "center",
			position: "fixed",
			width: Zotero.Prefs.get(`${config.addonRef}.width`) as string,
			fontSize: "12px",
			color: "red",
			//borderRadius: "10px",
			//backgroundColor: "#fff",
			//boxShadow: `0px 1.8px 7.3px rgba(0, 0, 0, 0.071),
			//0px 6.3px 24.7px rgba(0, 0, 0, 0.112),
			//0px 30px 90px rgba(0, 0, 0, 0.2)`,
			fontFamily: fontFamily,
			//cursor: "pointer",
			zIndex: "3", 

		},
		properties: {
	            innerHTML: "" 
		}
            }, registerWrapContainer) as HTMLDivElement


	    const verifyWarnNoteContainer = ztoolkit.UI.appendElement({
	        tag: "div", 
		id: "verifyWarnNote",
	        styles: {
			display: "none",
			flexDirection: "column",
			//justifyContent: "flex-start",
			justifyContent: "center",
			alignItems: "center",
			position: "fixed",
			width: Zotero.Prefs.get(`${config.addonRef}.width`) as string,
			fontSize: "12px",
			color: "red",
			//borderRadius: "10px",
			//backgroundColor: "#fff",
			//boxShadow: `0px 1.8px 7.3px rgba(0, 0, 0, 0.071),
			//0px 6.3px 24.7px rgba(0, 0, 0, 0.112),
			//0px 30px 90px rgba(0, 0, 0, 0.2)`,
			fontFamily: fontFamily,
			//cursor: "pointer",
			zIndex: "3", 

		},
		properties: {
	            innerHTML: "" 
		}
            }, registerWrapContainer) as HTMLDivElement

            
	    const registerNoteContainer = ztoolkit.UI.appendElement({
		tag: "div",
		id: "registerNote",
		styles: {
		  display: "flex",
		  flexDirection: "column",
		  //justifyContent: "flex-start",
		  //justifyContent: "center",
		  //alignItems: "center",
		  position: "fixed",
		  width: Zotero.Prefs.get(`${config.addonRef}.width`) as string,
		  fontSize: "15px",
		  //borderRadius: "10px",
		  //backgroundColor: "#fff",
		  //boxShadow: `0px 1.8px 7.3px rgba(0, 0, 0, 0.071),
		  //0px 6.3px 24.7px rgba(0, 0, 0, 0.112),
		  //0px 30px 90px rgba(0, 0, 0, 0.2)`,
		  fontFamily: fontFamily,
		  //color: "#1e90ff",
		  //cursor: "pointer",
		  zIndex: "3", 
		  //margin: "20px" 
		},
		
		properties: {
		  value: "",
		  innerHTML: "Now subscribe for free to get the enhanced features:<br/> 1. For Mac users, chat with local SOTA LLMs(llama) without pay.<br/> 2. Access GPT-4o, Gemini and Claude in one client.<br/> 3. Secure for your data, All stored locally, not upload to the Cloud." 
		}
	     }, registerWrapContainer) as HTMLDivElement

	    const closeContainer = ztoolkit.UI.appendElement({
		tag: "div",
		id: "close",
		styles: {
		  display: "flex",
		  flexDirection: "column",
		  position: "fixed",
		  width: Zotero.Prefs.get(`${config.addonRef}.width`) as string,
		  fontSize: "15px",
		  borderRadius: "10px",
		  backgroundColor: "#fff",
		  boxShadow: `0px 1.8px 7.3px rgba(0, 0, 0, 0.071),
		  0px 6.3px 24.7px rgba(0, 0, 0, 0.112),
		  0px 30px 90px rgba(0, 0, 0, 0.2)`,
		  fontFamily: fontFamily,
		  color: "#1e90ff",
		  cursor: "pointer",
		  zIndex: "3", 
		  margin: "20px" 
		},
		properties: {
		  value: "",
		  innerHTML: "X" 
		}
	     }, registerWrapContainer)

             closeContainer.addEventListener("click", async event => {
	         event.stopPropagation();
                 backgroundContainer.style.display = "none"
		 registerWrapContainer.style.display = "none" 
             })

             const subscribeSubmitContainer = ztoolkit.UI.appendElement({
	       tag: "div",
	       id: "subscribeSubmit",
	       styles: {
	          display: "flex",
		  flexDirection: "column",
                  justifyContent: "center",
			alignItems: "center",
			position: "fixed",

		   backgroundColor: "#fff",
		   fontSize: "15px", 
		   boxShadow: `0px 1.8px 7.3px rgba(0, 0, 0, 0.071),
		   0px 6.3px 24.7px rgba(0, 0, 0, 0.112),
		   0px 30px 90px rgba(0, 0, 0, 0.2)`,
		   borderRadius: "8px",
                   border: "1px solid #fff",
		   cursor: "pointer",
		   whiteSpace: "nowrap",
		   zIndex: "3"
	       }, 
	       properties: {
	           innerHTML: "Subscribe" 
	       },
	       listeners: [
		 { 
	           type: "mousedown",
                   listener: (event: any) => {
		     subscribeSubmitContainer.style.backgroundColor = "#C0C0C0"; 
		   }
		 },
		 {
	           type: "mouseup",
		   listener: async (event: any) => {
		     event.stopPropagation();
		     var emailRegExp=/^\w+([-+.]\w+)*@\w+([-.]\w+)*\.\w+([-.]\w+)*$/;
                     var ok = emailRegExp.test(subscribeContainer.value)
		 
		     var message = ""
		     let res
		     if (ok) {
		       subscribeContainer.style.border = ""
                       const url = `https://www.papersgpt.com/api/zoterosubscribe` 
		       try {
			 res = await Zotero.HTTP.request(
		             "POST",
			     url,
			     {
			         responseType: "json",
				 headers: {
				     "Content-Type": "application/json",
				 },
				 body: JSON.stringify({
				     email: subscribeContainer.value
				 }),
			     })
		       } catch (error: any) {
			     message = "Network error! Please check your network and try it again!"
		              
			     subscribeWarnNoteContainer.style.display = "flex"
			     subscribeWarnNoteContainer.innerHTML = message
		             subscribeContainer.style.border = "1px solid red"
		       }

		       if (res?.response) {
			 var code = res.response.status
			 if (code == 200) {
			     message = "Success! Please check license in email and activate!"
			     subscribeWarnNoteContainer.style.display = "flex"
			     subscribeWarnNoteContainer.innerHTML = message
			     subscribeWarnNoteContainer.style.color = "green" 
			     subscribeWarnNoteContainer.style.justifyContent = "flex-start" 
			 } else {
			     message = res.response.message 
			     subscribeWarnNoteContainer.style.display = "flex"
			     subscribeWarnNoteContainer.innerHTML = message
			     subscribeContainer.style.border = "1px solid red"
			 }
		       }
		     } else {
		       message = "Email not valid!"
		       subscribeContainer.style.border = "1px solid red"
		       subscribeWarnNoteContainer.style.display = "flex"
		       subscribeWarnNoteContainer.innerHTML = message 
		     }

		     subscribeSubmitContainer.style.backgroundColor = "#fff"; 
		   }
		 }
	       ]
	     }, registerWrapContainer) as HTMLSelectElement


		     const licenseContainer = ztoolkit.UI.appendElement({
			tag: "input", 
			id: "lcenseInput",
			styles: {
				display: "flex",
				flexDirection: "column",
				//justifyContent: "flex-start",
				justifyContent: "center",
				alignItems: "center",
				position: "fixed",
				width: Zotero.Prefs.get(`${config.addonRef}.width`) as string,
				fontSize: "15px",
				borderRadius: "10px",
				backgroundColor: "#fff",
				boxShadow: `0px 1.8px 7.3px rgba(0, 0, 0, 0.071),
				0px 6.3px 24.7px rgba(0, 0, 0, 0.112),
				0px 30px 90px rgba(0, 0, 0, 0.2)`,
				fontFamily: fontFamily,
				//color: "#1e90ff",
				//cursor: "pointer",
				//spacing: "20px", 
				zIndex: "3", 

			},
			properties: {
			    type: "text",
			    placeholder: "License" 
			}
		    }, registerWrapContainer) as HTMLDivElement

		    const verifyLicenseContainer = ztoolkit.UI.appendElement({
			tag: "div",
			id: "verifyLicense",
			styles: {
			  display: "flex",
			  flexDirection: "column",
			  justifyContent: "center",
			  alignItems: "center",
			  position: "fixed",
			  width: Zotero.Prefs.get(`${config.addonRef}.width`) as string,
			  fontSize: "15px",
			  borderRadius: "8px",
			  backgroundColor: "#fff",
			  boxShadow: `0px 1.8px 7.3px rgba(0, 0, 0, 0.071),
			  0px 6.3px 24.7px rgba(0, 0, 0, 0.112),
			  0px 30px 90px rgba(0, 0, 0, 0.2)`,
			  fontFamily: fontFamily,
			  cursor: "pointer",
			  zIndex: "3", 
		        },
		        properties: {
		          value: "",
		          innerHTML: "Activate" 
		        },
                        listeners: [
		          { 
	                    type: "mousedown",
                            listener: (event: any) => {
		              verifyLicenseContainer.style.backgroundColor = "#C0C0C0"; 
		            }
		          },
		          {
	                    type: "mouseup",
		            listener: async (event: any) => {
		              event.stopPropagation();
		
			      let res
			      const url = `https://www.papersgpt.com/api/zoteroactivate`
			      try {
				      res = await Zotero.HTTP.request(
					      "POST",
					      url,
					      {
						      responseType: "json",
						      headers: {
							      "Content-Type": "application/json",
						      },
						      body: JSON.stringify({
							      email: subscribeContainer.value,
							      license: licenseContainer.value, 
						      }),
					      })
			      } catch (error: any) {
				      licenseContainer.style.border = "1px solid red"
				      verifyWarnNoteContainer.style.display = "flex"
				      verifyWarnNoteContainer.innerHTML = "Network error! Please check your network and try it again!"
			      }

			      if (res?.response) {
				      if (res.response.status && res.response.status == 200) {
					      const email =  subscribeContainer.value
					      const token = licenseContainer.value
					      Zotero.Prefs.set(`${config.addonRef}.email`, email) 	
					      Zotero.Prefs.set(`${config.addonRef}.token`, token) 	
					      Zotero.Prefs.set(`${config.addonRef}.isLicenseActivated`, true) 
					      Zotero.Prefs.set(`${config.addonRef}.grade`, res.response.grader) 	

                                
					      await Zotero[config.addonInstance].views.updatePublisherModels(email, token)
					      Zotero[config.addonInstance].views.createOrUpdateModelsContainer()


					      backgroundContainer.style.display = "none" 

					      registerWrapContainer.style.display = "none" 

					      return	    
				      } else {
					      licenseContainer.style.border = "1px solid red"
					      verifyWarnNoteContainer.style.display = "flex"
					      verifyWarnNoteContainer.innerHTML = res.response.message
					      return 
				      }
			      } 

			      verifyLicenseContainer.style.backgroundColor = "#fff"; 
			    }
			  }]
		    }, registerWrapContainer) as HTMLDivElement


	     var curShowContainer = registerWrapContainer
             var isActivated = Zotero.Prefs.get(`${config.addonRef}.isLicenseActivated`)
             if (isActivated) {
	       registerWrapContainer.style.display = "none"
	       subscriberShowContainer.style.display = "flex"
	       curShowContainer = subscriberShowContainer 
	     } 

	     document.documentElement.append(backgroundContainer)
             document.documentElement.append(subscriberShowContainer)
             document.documentElement.append(registerWrapContainer)

             backgroundContainer.style.display = "flex"
		      
	     backgroundContainer.style.height = "50%" 
	     backgroundContainer.style.width = container.style.width 

	     backgroundContainer.style.left = container.style.left 
	     backgroundContainer.style.top = container.style.top 


	     var x = -1
	     var y = -1
	     if (x + y < 0) {
	       const rect = document.documentElement.getBoundingClientRect()
	       //x = rect.width / 2 - registerWrapContainer.offsetWidth / 2;
	       x = rect.width / 2 - curShowContainer.offsetWidth / 2;
	       //y = rect.height / 2 - registerWrapContainer.offsetHeight / 2;
	       y = rect.height / 2 - curShowContainer.offsetHeight / 2;
	     }

	     // ensure container doesn't go off the right side of the screen
	     //if (x + registerWrapContainer.offsetWidth > window.innerWidth) {
	     if (x + curShowContainer.offsetWidth > window.innerWidth) {
	       //x = window.innerWidth - registerWrapContainer.offsetWidth
	       x = window.innerWidth - curShowContainer.offsetWidth
	     }

	     // ensure container doesn't go off the bottom of the screen
	     //if (y + registerWrapContainer.offsetHeight > window.innerHeight) {
	     if (y + curShowContainer.offsetHeight > window.innerHeight) {
	       //y = window.innerHeight - registerWrapContainer.offsetHeight
	       y = window.innerHeight - curShowContainer.offsetHeight
	     }

             // ensure container doesn't go off the left side of the screen
             if (x < 0) {
 	       x = 0
             }

		      // ensure container doesn't go off the top of the screen
		      if (y < 0) {
			      y = 0
		      }
		      // this.container.style.display = "flex"
		  

		      registerWrapContainer.style.left = `${x}px`
		      registerWrapContainer.style.top = `${y}px`
		      registerWrapContainer.style.height = "300px" 

	              subscriberShowContainer.style.left = `${x}px` 
	              subscriberShowContainer.style.top = `${y}px` 
	              subscriberShowContainer.style.height = "150px" 


		      closeContainer.style.left = `${x}px` 
		      closeContainer.style.top = `${y}px`
		      closeContainer.style.width = "6px" 
		      closeContainer.style.height = "6px"

		      subscriberCloseContainer.style.width = "6px" 
		      subscriberCloseContainer.style.height = "6px"

		       
		      registerNoteContainer.style.left = `${x + container.clientWidth * 0.1}px`
		      registerNoteContainer.style.top = `${y + 20}px`
		      registerNoteContainer.style.width = `${container.clientWidth * 0.85}px`
		      registerNoteContainer.style.height = "100px"
                       
		      subscribeContainer.style.left = `${x + container.clientWidth * 0.2}px`
		      subscribeContainer.style.top = `${y + 135}px`
		      subscribeContainer.style.width = `${container.clientWidth * 0.6}px` 
		      subscribeContainer.style.height = "32px"
	           
		      subscribeWarnNoteContainer.style.left = `${x + container.clientWidth * 0.2}px`
		      subscribeWarnNoteContainer.style.top = `${y + 172}px` 
		      subscribeWarnNoteContainer.style.width = `${container.clientWidth * 0.6}px` 
		      subscribeWarnNoteContainer.style.height = "28px" 


	              subscribeSubmitContainer.style.left = `${x + container.clientWidth * 0.8 + 15}px`
		      subscribeSubmitContainer.style.top = `${y + 134}px`
		      subscribeSubmitContainer.style.width = "68px" 
		      subscribeSubmitContainer.style.height = "39px"
	            
                      verifyLicenseContainer.style.left = `${x + container.clientWidth * 0.8 + 15}px` 
                      verifyLicenseContainer.style.top = `${y + 210}px` 
                      verifyLicenseContainer.style.width = "68px" 
                      verifyLicenseContainer.style.height = "39px" 

		      
		      licenseContainer.style.left = `${x + container.clientWidth * 0.2}px`      
	              licenseContainer.style.top = 	`${y + 210}px`
	              licenseContainer.style.width = 	`${container.clientWidth * 0.6}px`      
	              licenseContainer.style.height = 	 "32px"     
	
		      verifyWarnNoteContainer.style.left = `${x + container.clientWidth * 0.2}px`
		      verifyWarnNoteContainer.style.top = `${y + 240}px` 
		      verifyWarnNoteContainer.style.width = `${container.clientWidth * 0.6}px` 
		      verifyWarnNoteContainer.style.height = "28px" 
	
	}
        window.alert('Subscribe', this.container!);
      })
    

    // input 
    const inputContainer = this.inputContainer = ztoolkit.UI.appendElement({
      tag: "div",
      id: "input-container",
      styles: {
        width: "100%",
        display: "flex",
        justifyContent: "center",
        flexDirection: "column",
        alignItems: "center",
      },
      children: [
        {
	  tag: "div",
	  id: "input-send-container",
	  styles: {
            width: "100%",
	    display: "flex",
            alignItems: "center",
	  },
	  children: [ {
          tag: "input",
          styles: inputStyles,
          id: "input-send-input"
	  } ,
          {
          tag: "div",
	  id: "send-icon-container",
	  classList: ["send-msgs-icon"],
          styles: buttonStyles
        },
        // 添加停止按钮
        {
        tag: "div",
        id: "stop-icon-container",
        classList: ["stop-msgs-icon"],
        styles: stopButtonStyles
        }
	]

        },
        {
          tag: "textarea",
          styles: {
            display: "none",
            width: "calc(100% - 1.5em)",
            maxHeight: "20em",
            minHeight: "2em",
            borderRadius: "10px",
            border: "none",
            outline: "none",
            resize: "vertical",
            marginTop: "0.55em",
            fontFamily: "Consolas",
            fontSize: ".8em"

          }
        }
      ]
    }, container) as HTMLDivElement
    const inputNode = inputContainer.querySelector("input")!;
    Object.assign(inputNode.style, inputStyles);
    this.bindUpDownKeys(inputNode)
    const textareaNode = inputContainer.querySelector("textarea")!
    const sendMsgNode = inputContainer.querySelector(".send-msgs-icon")
    const stopMsgNode = inputContainer.querySelector(".stop-msgs-icon")

       
    ztoolkit.UI.appendElement({
        tag: "img",
	id: "msg-send-icon",
	styles: {
          position: "absolute",
	  top: "30%",
	  left: "30%",
          width: "1.2em",
	  height: "1.2em",
          justifyContent: "center"	
	},
	properties: {
            src: `chrome://${config.addonRef}/content/icons/paperplane-fill.svg`,
	    alt: ""	    
	},
    }, sendMsgNode)

    ztoolkit.UI.appendElement({
        tag: "img",
        id: "msg-stop-icon",
        styles: {
          position: "absolute",
          top: "30%",
          left: "30%",
          width: "1.2em",
          height: "1.2em",
          justifyContent: "center"	
        },
        properties: {
            src: `chrome://${config.addonRef}/content/icons/stop-circle-fill.svg`,
            alt: "Stop"	    
        },
    }, stopMsgNode)

    sendMsgNode.addEventListener("mousedown", async event => {
        let msgNode = this.inputContainer.querySelector(".send-msgs-icon")
        let text = this.inputContainer.querySelector("input")?.value as string
        if (msgNode && text.length > 0 && !this.isInference) {
            msgNode.style.backgroundColor = "#fff0f5"
            this.execTag({tag: "Chat PDF", position: 1, color: "red", trigger: "", text: defaultChatPrompt})
	}	
    })

    inputNode.addEventListener("input", async event => {

        let text = this.inputContainer.querySelector("input")?.value as string
	if (text.length > 0 && !this.isInference) {
          const sendMsgNode = inputContainer.querySelector(".send-msgs-icon")
          sendMsgNode.style.backgroundColor = "#4169e1"
	} else {
          sendMsgNode.style.backgroundColor = "#fff0f5" 
	}	
    })

    
    const that = this;
    let lastInputText = ""
    let inputListener = function (event: KeyboardEvent) {
      // @ts-ignore
      if(this.style.display == "none") { return }
      // @ts-ignore
      let text = Meet.Global.input = this.value
      if ((event.ctrlKey || event.metaKey) && ["s", "r"].indexOf(event.key) >= 0 && textareaNode.style.display != "none") {
        // must save，but not necessary to execute
        const tag = parseTag(text)
        if (tag) {
          // @ts-ignore
          this.value = tag.text
          let tags = that.getTags()
	  // If tags exist, maybe to update, removed from tags
          tags = tags.filter((_tag: Tag) => {
            return _tag.tag != tag.tag
          })
          tags.push(tag)
          that.setTags(tags)
          that.renderTags();
          if (event.key == "s") {
            new ztoolkit.ProgressWindow("Save Tag")
              .createLine({ text: tag.tag, type: "success" })
              .show()
            return
          }
          // Execute codes, and then save the tags
          if (event.key == "r") {
            return that.execTag(tag)
          }
        }
        // normal text
        else {
          if (event.key == "r") {
            // Long text is executed as an unsaved command label, You can write js in long text
            return that.execTag({tag: "Untitled", position: -1, color: "", trigger: "", text})
          }
        }
      }
      if (event.key == "Enter") { 
        ztoolkit.log(event)
        
        outputContainer.querySelector(".auxiliary")?.remove()

        if (event.ctrlKey || event.metaKey) {
          ztoolkit.log("Ctrl + Enter")
          let tag = that._tag || that.getTags()[0]
          return that.execTag(tag)
        }
        if (event.shiftKey) {
          if (inputNode.style.display != "none") {
            inputNode.style.display = "none"
            textareaNode.style.display = ""
            textareaNode.focus()
            textareaNode.value = text + "\n"
          }
          return
        }
        if (text.length != lastInputText.length) {
          lastInputText = text
          return
        }
        if (text.startsWith("#")) {
          if (inputNode.style.display != "none") {
            inputNode.style.display = "none"
            textareaNode.style.display = ""
            textareaNode.focus()
            const tags = that.getTags();
            const tag = tags.find((tag: any) => tag.text.startsWith(text.split("\n")[0]))
            if (tag) {
              textareaNode.value = tag.text
            } else {
              textareaNode.value = text + "\n"
            }
          }
        } else if (text.startsWith("/")) {
          that._history.push(text)
          that.stopAlloutput()
          text = text.slice(1)
          let [key, value] = text.split(" ")
          if (key == "clear") {
            that.messages = []
            // @ts-ignore
            this.value = ""
            that.setText("success", true, false)
          } else if (key == "help"){ 
            that.setText(help, true, false)
          } else if (key == "report") { 
            const secretKey = Zotero.Prefs.get(`${config.addonRef}.secretKey`) as string
            return that.setText(`\`api\` ${Zotero.Prefs.get(`${config.addonRef}.api`)}\n\`secretKey\` ${secretKey.slice(0, 3) + "..." + secretKey.slice(-4)}\n\`model\` ${Zotero.Prefs.get(`${config.addonRef}.model`)}\n\`temperature\` ${Zotero.Prefs.get(`${config.addonRef}.temperature`)}`, true, false)
          } else if (["secretKey", "model", "api", "temperature", "deltaTime", "width", "tagsMore", "chatNumber", "relatedNumber"].indexOf(key) >= 0) {  
            if (value?.length > 0) {
              if (value == "default") {
                Zotero.Prefs.clear(`${config.addonRef}.${key}`)
                value = Zotero.Prefs.get(`${config.addonRef}.${key}`)
                that.setText(`${key} = ${value}`, true, false)
                return 
              }
              switch (key) {
                case "deltaTime":
                case "relatedNumber":
                case "chatNumber":
                  Zotero.Prefs.set(`${config.addonRef}.${key}`, Number(value))
                  break;
                case "width":
                  ztoolkit.log("width", value.match(/^[\d\.]+%$/))
                  if (value.match(/^[\d\.]+%$/)) {
                    that.container.style.width = value
                    Zotero.Prefs.set(`${config.addonRef}.${key}`, value)
                    break;
                  } else {
                    ztoolkit.log("width Error")
                    return that.setText(`Invalid value, ${value}, please enter a percentage, for example \`32 %\`.`, true, false)
                  }
                case "tagsMore":
                  if (["scroll", "expand"].indexOf(value) >= 0) {
                    Zotero.Prefs.set(`${config.addonRef}.${key}`, value)
                    break;
                  } else {
                    ztoolkit.log("tagsMore Error")
                    return that.setText(`Invalid value, ${value}, please enter \`expand\` or \`scroll\`.`, true, false)
                  }
                default: 
                  Zotero.Prefs.set(`${config.addonRef}.${key}`, value)
                  break
              }
            } else {
              value = Zotero.Prefs.get(`${config.addonRef}.${key}`)
            }
            that.setText(`${key} = ${value}`, true, false)
            // @ts-ignore
            this.value = ""
          } else {
            that.setText(help, true, false)
            const mdbody = that.outputContainer.querySelector(".markdown-body") as HTMLDivElement
            mdbody.innerHTML = `<center><span style="color: #D14D72;font-weight:bold;font-size:20px;">Invalid Command, Please Read this.</span></center>` + mdbody.innerHTML
          }
        } else {
          that.execText(text)
          that._history.push(text)
        }
      } else if (event.key == "Escape") {
        outputContainer.style.display = "none"
        // Exit long article editing mode
        if (textareaNode.style.display != "none") {
          textareaNode.style.display = "none"
          inputNode.value = ""
          inputNode.style.display = ""
          inputNode.focus()
          //return
        }
        if (inputNode.value.length) {
          inputNode.value = ""
          //return
        }
        // Exit container
        that.hide()
        that.container!.remove()
        that.isInNote && Meet.BetterNotes.reFocus()
	if (Zotero.isMac) {
            var filename = "ChatPDFLocal"
            if (!(IOUtils.exists(filename))) {
                const temp = Zotero.getTempDirectory();
                filename = PathUtils.join(temp.path.replace(temp.leafName, ""), `${filename}.dmg`);
            } 
            shutdownLocalLLMEngine()
	    Zotero.Prefs.set(`${config.addonRef}.startLocalServer`, false)
	}	
        Zotero.Prefs.set(`${config.addonRef}.papersgptState`, "Offline")
      }
    }
    inputNode.addEventListener("keyup", inputListener)
    textareaNode.addEventListener("keyup", inputListener)
    const outputContainer = this.outputContainer = ztoolkit.UI.appendElement({
      tag: "div",
      id: "output-container",
      styles: {
        width: "calc(100% - 1em)",
        backgroundColor: "rgba(89, 192, 188, .08)",
        color: "#374151",
        maxHeight: document.documentElement.getBoundingClientRect().height * .5 + "px",
        overflowY: "auto",
        overflowX: "hidden",
        padding: "0.25em 0.5em",
        display: "none",
        // resize: "vertical"
      },
      children: [
        {
          tag: "div", // Change this to 'div'
          classList: ["markdown-body"],
          styles: {
            fontSize: "0.8em",
            lineHeight: "2em",
            // margin: ".5em 0"
          },
          properties: {
            // Used to copy 
            pureText: ""
          }
        }
      ],
      listeners: [
        {
          /**
           * Double-clicking is the output of the plug-in, which may be inserting notes 
           */
          type: "dblclick",
          listener: () => {
            // No matter what error occurs later, be sure to copy it first
            // At present, the user's version of Better Notes may be old and does not support the API.
            const text = outputContainer.querySelector("[pureText]")!.getAttribute("pureText") || ""
            new ztoolkit.Clipboard()
              .addText(text, "text/unicode")
              .copy()
            const div = outputContainer.cloneNode(true) as HTMLDivElement
            div.querySelector(".auxiliary")?.remove()
            const htmlString = div.innerHTML
            if (Zotero_Tabs.selectedIndex == 1 && Zotero.BetterNotes) {
              Meet.BetterNotes.insertEditorText(htmlString)
              this.hide()
              new ztoolkit.ProgressWindow(config.addonName)
                .createLine({ text: "Insert To Main Note", type: "success" })
                .show()
              return
            }
            if (Zotero_Tabs.selectedIndex > 0) {
              const parentID = Zotero.Items.get(
                Zotero.Reader.getByTabID(Zotero_Tabs.selectedID)!.itemID as number
              ).parentID
              
              const editor = Zotero.Notes._editorInstances.find(
                (e) =>
                  e._item.parentID === parentID && !Components.utils.isDeadWrapper(e._iframeWindow)
              );
              ztoolkit.log(editor)
              // The insertion of notes into the current entry is triggered only when the note is opened and the note view is opened. 
              if (editor && document.querySelector("#zotero-tb-toggle-notes-pane.toggled")) {
                Meet.BetterNotes.insertEditorText(htmlString, editor)
                new ztoolkit.ProgressWindow(config.addonName)
                  .createLine({ text: "Insert To Note", type: "success" })
                  .show()
                return
              }
            }
            new ztoolkit.ProgressWindow(config.addonName)
              .createLine({ text: "Copy Plain Text", type: "success" })
              .show()
          }
        }
      ]
    }, container) as HTMLDivElement
    this.bindCtrlScrollZoomOutput(outputContainer)
    // command tag 
    const tagsMore = Zotero.Prefs.get(`${config.addonRef}.tagsMore`) as string
    const tagsContainer = this.tagsContainer = ztoolkit.UI.appendElement({
      tag: "div",
      classList: ["tags-container"],
      styles: {
        width: "calc(100% - .5em)",
        display: "flex",
        flexDirection: "row",
        justifyContent: "flex-start",
        alignItems: "center",
        margin: ".25em 0",
        flexWrap: tagsMore == "expand" ? "wrap" : "nowrap",
        overflow: "hidden",
        height: "1.7em"
      },
      listeners: [
        {
          type: "DOMMouseScroll",
          listener: (event: any) => {
            if (tagsMore == "expand") { return }
            const scrollSpeed = 80
            // @ts-ignore
            if (event.detail > 0) {
              tagsContainer.scrollLeft += scrollSpeed
            } else {
              tagsContainer.scrollLeft -= scrollSpeed
            }
            event.preventDefault()
            event.stopPropagation()
          }
        }
      ]
    }, container) as HTMLDivElement
    this.dotsContainer = ztoolkit.UI.appendElement({
      tag: "div",
      classList: ["three-dots"],
      styles: {
        // width: "100%",
        display: "flex",
        height: "1em",
        justifyContent: "center",
        alignItems: "center",
        marginBottom: "0.25em",
        cursor: "pointer",
        opacity: ".5",
        transition: "opacity .25s linear"
      },
      children: (() => {
          let arr = []
          for (let i = 0; i < 3; i++) {
            arr.push({
              tag: "div",
              classList: ["dot"],
              styles: {
                width: "6px",
                height: "6px",
                margin: "0 .25em",
                backgroundColor: "#ff7675",
                borderRadius: "6px",
              },
            })
          }
          return arr
        })() as any,
      listeners: [
        {
          type: "click",
          listener: () => {
            if (tagsMore == "scroll") { return }
            tagsContainer.style.height = tagsContainer.style.height == "auto" ? "1.7em" : "auto"
          }
        }
      ]
    }, container) as HTMLDivElement
    document.documentElement.append(container)
    this.renderTags()
    // focus 
    window.setTimeout(() => {
      container.focus()
      inputContainer.focus()
      inputNode.focus()
    })
    return container
  }

  /**
   * Render tags, sorted according to position
   */
  private renderTags() {
    this.tagsContainer!?.querySelectorAll("div").forEach(e=>e.remove())
    let tags = this.getTags() as Tag[]
    tags.forEach((tag: Tag, index: number) => {
      this.addTag(tag, index)
    })
  }

  /**
   * add a tag 
   */
  private addTag(tag: Tag, index: number) {
    let [red, green, blue] = this.utils.getRGB(tag.color)
    let timer: undefined | number;
    let container = this.tagsContainer!
    ztoolkit.UI.appendElement({
      tag: "div",
      id: `tag-${index}`,
      classList: ["tag"],
      styles: {
        ...tagStyles,
        color: `rgba(${red}, ${green}, ${blue}, 1)`,
        backgroundColor: `rgba(${red}, ${green}, ${blue}, 0.1)`
      },
    }, container)
    ztoolkit.UI.appendElement({
      tag: "div",
      classList: ["tag-name"],
      styles: {
        paddingLeft: "0.5em"
      },
      properties: {
        innerText: tag.tag
      }
    }, container)
    ztoolkit.UI.appendElement({
      tag: "div",
      classList: ["tag-delete"],
      styles: {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: "16px",
        height: "16px",
        borderRadius: "50%",
        backgroundColor: "rgba(255, 255, 255, 0.2)",
        cursor: "pointer",
        transition: uiConfig.transition,
        "&:hover": {
          backgroundColor: "rgba(255, 255, 255, 0.3)"
        }
      },
      listeners: [
        {
          type: "click",
          listener: (event: any) => {
            timer = window.setTimeout(() => {
              timer = undefined
              if (event.buttons == 1) {                
                // Enter edit mode 
                const textareaNode = this.inputContainer?.querySelector("textarea")!
                const inputNode = this.inputContainer?.querySelector("input")!
                inputNode.style.display = "none";
                textareaNode.style.display = ""
                textareaNode.value = tag.text
                this.outputContainer.style!.display = "none"
              } else if (event.buttons == 2) {
                let tags = this.getTags()
                tags = tags.filter((_tag: Tag) => _tag.tag != tag.tag)
                this.setTags(tags)
                this.renderTags();
              }
            }, 1000)
          }
        }
      ]
    }, container)
  }

  /**
   * execute tag 
   */
  private async execTag(tag: Tag) {
    if (this.isInference) {
      return 
    }
    this.isInference = true
    
    // 添加这些行来显示停止按钮并隐藏发送按钮
    const sendMsgNode = this.inputContainer.querySelector(".send-msgs-icon") as HTMLElement;
    const stopMsgNode = this.inputContainer.querySelector(".stop-msgs-icon") as HTMLElement;
    
    if (sendMsgNode && stopMsgNode) {
        sendMsgNode.style.display = "none";
        stopMsgNode.style.display = "flex";
    }
    
    let msgNode = this.inputContainer.querySelector(".send-msgs-icon")
    let inputText = this.inputContainer.querySelector("input")?.value as string
    if (msgNode && inputText.length > 0) {
        msgNode.style.backgroundColor = "#fff0f5"
    }	
    
    let chatTag = tag.tag
    if (chatTag == "Chat PDF") {
      Meet.Global.input = this.inputContainer.querySelector("input")?.value as string
    } else if (chatTag == "Summary") {
      Meet.Global.input = defaultBuiltInPrompts[0] 
    } else if (chatTag == "Topic")  {
      Meet.Global.input = defaultBuiltInPrompts[1] 
    } else if (chatTag == "Background") {
      Meet.Global.input = defaultBuiltInPrompts[2] 
    } else if (chatTag == "Innovations") {
      Meet.Global.input = defaultBuiltInPrompts[3] 
    } else if (chatTag == "Challenges") {
      Meet.Global.input = defaultBuiltInPrompts[4] 
    } else if (chatTag == "Outlook") { 
      Meet.Global.input = defaultBuiltInPrompts[5] 
    }
    //Meet.Global.input = this.inputContainer.querySelector("input")?.value as string
    this._tag = tag
    const popunWin = new ztoolkit.ProgressWindow(tag.tag, { closeOnClick: true, closeTime: -1, closeOtherProgressWindows: true })
      .show()

    Meet.Global.popupWin = popunWin
    popunWin
      .createLine({ text: "Generating input content...", type: "default" })
    this.dotsContainer?.classList.add("loading")
    this.outputContainer.style.display = "none"
    /*
    ztoolkit.log(tag, this.getTags())
    const tagIndex = this.getTags().map(JSON.stringify).indexOf(JSON.stringify(tag)) as number
    this.rippleEffect(
      this.container.querySelector(`#tag-${tagIndex}`)!,
      tag.color
    )*/

    //const tagIndex = this.getTags().map(JSON.stringify).indexOf(JSON.stringify(tag)) as number
    if (chatTag == "Chat PDF") { 
      this.rippleEffect(
        this.container.querySelector(`#tag-chatpdf`)!,
        tag.color
      )
    } else  {
      const tagIndex = this.getTags().map(JSON.stringify).indexOf(JSON.stringify(tag)) as number
      this.rippleEffect(
        this.container.querySelector(`#tag-${tagIndex}`)!,
        tag.color
      )
    }

    const outputDiv = this.outputContainer.querySelector("div")!
    outputDiv.innerHTML = ""
    outputDiv.setAttribute("pureText", "");
    let text = tag.text.replace(/^#.+\n/, "")
    // new match version
    for (let rawString of text.match(/```j(?:ava)?s(?:cript)?\n([\s\S]+?)\n```/g)! || []) {
      let codeString = rawString.match(/```j(?:ava)?s(?:cript)?\n([\s\S]+?)\n```/)![1]
      try {
        text = text.replace(rawString, await window.eval(`${codeString}`))
      } catch { }
    }
    for (let rawString of text.match(/\$\{[\s\S]+?\}/g)! || []) {
      let codeString = rawString.match(/\$\{([\s\S]+?)\}/)![1]
      try {
        text = text.replace(rawString, await window.eval(`${codeString}`))
      } catch {  }
    }
    popunWin.createLine({ text: `Characters ${text.length}`, type: "success" })
    popunWin.createLine({ text: "Answering...", type: "default" })
    // 修改后的GPT响应处理逻辑
    const output_text = await Meet.integratellms.getGPTResponse(text) as string;
    
    // 更新最后一条消息内容（流式更新）
    this.messages[this.messages.length - 1].content = output_text;
    this.setText(output_text, true, true, false);  // isDone设为true表示最终响应
    this.dotsContainer?.classList.remove("loading")
    if (output_text.trim().length) {
      try {
        window.eval(`
          setTimeout(async () => {
            ${output_text}
          })
        `)
        popunWin.createLine({ text: "Code is executed", type: "success" })
      } catch { }
      popunWin.createLine({ text: "Done", type: "success" })
    } else {
      popunWin.createLine({ text: "Done", type: "fail" })
    }
    popunWin.startCloseTimer(1000) // 從3000毫秒減少到1000毫秒
    this.isInference = false
    
    msgNode = this.inputContainer.querySelector(".send-msgs-icon")
    inputText = this.inputContainer.querySelector("input")?.value as string
    if (msgNode && inputText.length > 0) {
        msgNode.style.backgroundColor = "#4169e1"
    }	

    // 恢复按钮状态
    if (sendMsgNode && stopMsgNode) {
        sendMsgNode.style.display = "flex";
        stopMsgNode.style.display = "none";
    }
  }

  /**
   * Execute input box text
   * @param text 
   * @returns 
   */
  private async execText(text: string) {
    // If there is a preset keyword | regular expression for a certain tag in the text, it will be converted to execute the tag
    const tag = this.getTags()
      .filter((tag: Tag) => tag.trigger?.length > 0)
      .find((tag: Tag) => {
      const trigger = tag.trigger
      if (trigger.startsWith("/") && trigger.endsWith("/")) {
        return (window.eval(trigger) as RegExp).test(text)
      } else {
        return text.indexOf(trigger as string) >= 0
      }
    })
    if (tag) { return this.execTag(tag) }

    this.outputContainer.style.display = "none"
    const outputDiv = this.outputContainer.querySelector("div")!
    outputDiv.innerHTML = ""
    outputDiv.setAttribute("pureText", "");
    if (text.trim().length == 0) { return }
    this.dotsContainer?.classList.add("loading")
    
    // 添加这些行来显示停止按钮并隐藏发送按钮
    const sendMsgNode = this.inputContainer.querySelector(".send-msgs-icon") as HTMLElement;
    const stopMsgNode = this.inputContainer.querySelector(".stop-msgs-icon") as HTMLElement;
    
    if (sendMsgNode && stopMsgNode) {
        sendMsgNode.style.display = "none";
        stopMsgNode.style.display = "flex";
    }
    
    await Meet.integratellms.getGPTResponse(text)
    
    // 恢复按钮状态
    if (sendMsgNode && stopMsgNode) {
        sendMsgNode.style.display = "flex";
        stopMsgNode.style.display = "none";
    }
    
    this.dotsContainer?.classList.remove("loading")
    this.isInference = false; // 添加这行以重置推理状态
  }

  /**
   * Get all saved tags from Zotero.Prefs
   * Return after sorting according to position order
   */
  private getTags() {
    let tagsJson
    try {
      tagsJson = Zotero.Prefs.get(`${config.addonRef}.tags`) as string
    } catch {}
    if (!tagsJson) {
      tagsJson = "[]"
      Zotero.Prefs.set(`${config.addonRef}.tags`, tagsJson)
    }
    let tags = JSON.parse(tagsJson)
    for (let defaultTag of defaultBuiltInTags) {
      if (!tags.find((tag: Tag) => tag.tag == defaultTag.tag)) {
        tags.push(defaultTag)
      }
    }
    return (tags.length > 0 ? tags : defaultBuiltInTags).sort((a: Tag, b: Tag) => a.position - b.position)
  }

  private setTags(tags: any[]) {
    Zotero.Prefs.set(`${config.addonRef}.tags`, JSON.stringify(tags))
  }

  public show(x: number = -1, y: number = -1, reBuild: boolean = true) {
    return
    reBuild = reBuild || !this.container
    if (reBuild) {
      document.querySelectorAll(`#${this.id}`).forEach(e=>e.remove())
      this.container = this.buildContainer()
      this.container.style.display = "flex"
    }
    this.container.setAttribute("follow", "")
    if (x + y < 0) {
      const rect = document.documentElement.getBoundingClientRect()
      x = rect.width / 2 - this.container.offsetWidth / 2;
      y = rect.height / 2 - this.container.offsetHeight / 2;
    }

    // ensure container doesn't go off the right side of the screen
    if (x + this.container.offsetWidth > window.innerWidth) {
      x = window.innerWidth - this.container.offsetWidth
    }

    // ensure container doesn't go off the bottom of the screen
    if (y + this.container.offsetHeight > window.innerHeight) {
      y = window.innerHeight - this.container.offsetHeight
    }

    // ensure container doesn't go off the left side of the screen
    if (x < 0) {
      x = 0
    }

    // ensure container doesn't go off the top of the screen
    if (y < 0) {
      y = 0
    }
    // this.container.style.display = "flex"
    this.container.style.left = `${x}px`
    this.container.style.top = `${y}px`
    // reBuild && (this.container.style.display = "flex")
  }

  /**
   * Shutdown the ui and clear all the setIntervall
   */
  public hide() {
    this.container.style.display = "none"
    ztoolkit.log(this._ids)
    this._ids.map(id=>id.id).forEach(window.clearInterval)
  }

  public stopAlloutput() {
    this._ids.filter(id => id.type == "output").map(i => i.id).forEach(window.clearInterval)
  }

  public exit() {
    if (this.outputContainer) {
      this.outputContainer.style.display = "none"
    }
    if (this.inputContainer) {
      const textareaNode = this.inputContainer?.querySelector("textarea")!
      const inputNode = this.inputContainer?.querySelector("input")!
      if (textareaNode.style.display != "none") {
        textareaNode.style.display = "none"
        inputNode.value = ""
        inputNode.style.display = ""
        inputNode.focus()
        //return
      }
      if (inputNode.value.length) {
        inputNode.value = ""
        //return
      }
    }
    // exit container
    if (this.container) {
      this.hide()
      this.container!.remove()
      this.isInNote && Meet.BetterNotes.reFocus()
    }
    Zotero.Prefs.set(`${config.addonRef}.papersgptState`, "Offline")
  }

  /**
   * Enter auxiliary buttons on the output interface
   * This is a very extensible function
   * Help with positioning, such as locating entries, PDF comments, PDF paragraphs 
   */
  public insertAuxiliary(docs: Document[]) {
    this.outputContainer.querySelector(".auxiliary")?.remove()
    const auxDiv = ztoolkit.UI.appendElement({
      namespace: "html",
      classList: ["auxiliary"],
      tag: "div",
      styles: {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }
    }, this.outputContainer)
    docs.forEach((doc: Document, index: number) => {
      ztoolkit.UI.appendElement({
        namespace: "html",
        tag: "a",
        styles: {
          margin: ".3em",
          fontSize: "0.8em",
          cursor: "pointer",
          borderRadius: "3px",
          backgroundColor: "rgba(89, 192, 188, .43)",
          width: "1.5em",
          height: "1.5em",
          textAlign: "center",
          color: "white",
          fontWeight: "bold"
        },
        properties: {
          innerText: index + 1
        },
        listeners: [
          {
            type: "click",
            listener: async () => {
              if (doc.metadata.type == "box") {
                const reader = await ztoolkit.Reader.getReader();
                (reader!._iframeWindow as any).wrappedJSObject.eval(`
                  PDFViewerApplication.pdfViewer.scrollPageIntoView({
                    pageNumber: ${doc.metadata.box.page + 1},
                    destArray: ${JSON.stringify([null, { name: "XYZ" }, doc.metadata.box.left, doc.metadata.box.top, 3.5])},
                    allowNegativeOffset: false,
                    ignoreDestinationZoom: false
                  })
                `)
              } else if (doc.metadata.type == "id") {
                await ZoteroPane.selectItem(doc.metadata.id as number)
              }
            }
          }
        ]
      }, auxDiv)
    })
  }

  public createMenuNode(
    rect: { x: number, y: number, width: number, height: number },
    items: { name: string, listener: Function }[],
    separators: number[]
  ) {
    document.querySelector(".gpt-menu-box")?.remove()
    const removeNode = () => {
      document.removeEventListener("mousedown", removeNode)
      document.removeEventListener("keydown", keyDownHandler)
      window.setTimeout(() => {
        menuNode.remove()
      }, 0)
      this.inputContainer.querySelector("input")?.focus()
    }
    document.addEventListener("mousedown", removeNode)
    let menuNode = ztoolkit.UI.appendElement({
      tag: "div",
      classList: ["gpt-menu-box"],
      styles: {
        position: "fixed",
        left: `${rect.x}px`,
        top: `${rect.y}px`,
        width: `${rect.width}px`,
        display: "flex",
        height: `${rect.height}px`,
        justifyContent: "space-around",
        flexDirection: "column",
        padding: "6px",
        border: "1px solid #d4d4d4",
        backgroundColor: "#ffffff",
        borderRadius: "8px",
        boxShadow: `0px 1px 2px rgba(0, 0, 0, 0.028),
                                0px 3.4px 6.7px rgba(0, 0, 0, .042),
                                0px 15px 30px rgba(0, 0, 0, .07)`,
        overflow: "hidden",
        userSelect: "none",
      },
      children: (() => {
        let arr = [];
        for (let i = 0; i < items.length; i++) {
          arr.push({
            tag: "div",
            classList: ["menu-item"],
            styles: {
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "4px 8px",
              cursor: "default",
              fontSize: "13px",
              borderRadius: "4px",
              whiteSpace: "nowrap",
            },
            listeners: [
              {
                type: "mousedown",
                listener: async (event: any) => {
                  await items[i].listener()
                }
              },
              {
                type: "mouseenter",
                listener: function () {
                  nodes.forEach(e => e.classList.remove("selected"))
                  // @ts-ignore
                  this.classList.add("selected")
                  currentIndex = i
                }
              },
            ],
            children: [
              {
                tag: "div",
                classList: ["menu-item-name"],
                styles: {
                  paddingLeft: "0.5em",
                },
                properties: {
                  innerText: items[i].name
                }
              }
            ]
          })
          if (separators.indexOf(i) != -1) {
            arr.push({
              tag: "div",
              styles: {
                height: "0",
                margin: "6px -6px",
                borderTop: ".5px solid #e0e0e0",
                borderBottom: ".5px solid #e0e0e0",
              }
            })
          }

        }
        return arr
      })() as any
    }, document.documentElement)
    
    const winRect = document.documentElement.getBoundingClientRect()
    const nodeRect = menuNode.getBoundingClientRect()
    if (nodeRect.bottom > winRect.bottom) {
      menuNode.style.top = ""
      menuNode.style.bottom = "0px"
    }
    // menuNode.querySelector(".menu-item:first-child")?.classList.add("selected")
    const nodes = menuNode.querySelectorAll(".menu-item")
    nodes[0].classList.add("selected")
    let currentIndex = 0
    this.inputContainer.querySelector("input")?.blur()
    let keyDownHandler = (event: any) => {
      ztoolkit.log(event)
      if (event.code == "ArrowDown") {
        currentIndex += 1
        if (currentIndex >= nodes.length) {
          currentIndex = 0
        }
      } else if (event.code == "ArrowUp") {
        currentIndex -= 1
        if (currentIndex < 0) {
          currentIndex = nodes.length - 1
        }
      } else if (event.code == "Enter") {
        items[currentIndex].listener()
        
        removeNode()
      } else if (event.code == "Escape") {
        removeNode()
	if (Zotero.isMac) {
            var filename = "ChatPDFLocal"
            if (!(IOUtils.exists(filename))) {
                const temp = Zotero.getTempDirectory();
                filename = PathUtils.join(temp.path.replace(temp.leafName, ""), `${filename}.dmg`);
            } 
            shutdownLocalLLMEngine()
	    Zotero.Prefs.set(`${config.addonRef}.startLocalServer`, false)
	}	
      }
      nodes.forEach(e => e.classList.remove("selected"))
      nodes[currentIndex].classList.add("selected")
    }
    document.addEventListener("keydown", keyDownHandler)
    return menuNode
  }

  public async updatePublisherModels(email: string, token: string) {
    await getSupportedLLMs(this.publisher2models, this.publishers, email, token) 
  }

  private toggleDarkMode(isDark: boolean) {
    if (isDark) {
      if (this.container) {
        var selectNode = this.container.querySelector(".publisherSelect") 
        if (selectNode) {
	  //selectNode.style.backgroundColor = '#8d8d8d';//'#222';
	  //selectNode.style.color = '#fff';
	  selectNode.style.color = '#222';
	}

	var modelNode = this.container.querySelector(".modelSelect")
	if (modelNode) {
          modelNode.style.color = '#222';	
	}

        var apiNode = this.container.querySelector(".api")
	if (apiNode) {
          apiNode.style.color = '#222';	
	}
      }
    }   
  }


  public registerWindowAppearance() {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    if (mediaQuery) {
      mediaQuery.addEventListener('change', (event) => {
        this.isDarkMode = event.matches 
        this.toggleDarkMode(event.matches);
      });
    }
  } 


  public registerInToolbar() {
    const pluginName = "papersgpt"; 
    const papersgptNode = Zotero.getMainWindow().document.querySelector("#" + pluginName)!;
    if (papersgptNode) {
      return; 
    }

    Zotero.log("Calling callback")
    this.callback()

    const toolbar = Zotero.getMainWindow().document.querySelector("#zotero-items-toolbar")!;
    const lookupNode = toolbar.querySelector("#zotero-tb-lookup")!;
    const newNode = lookupNode?.cloneNode(true) as XUL.ToolBarButton;
    newNode.setAttribute("id", pluginName);
    if (Zotero.isMac) {
      newNode.setAttribute("tooltiptext", "Chat PDF with ChatGPT, Claude, Gemini and Local LLMs");
    } else {
      newNode.setAttribute("tooltiptext", "Chat PDF with ChatGPT, Claude, Gemini");
    }
    newNode.setAttribute("command", "");
    newNode.setAttribute("oncommand", "");
    newNode.setAttribute("mousedown", "");
    newNode.setAttribute("onmousedown", "");
    // newNode.addEventListener("click", async (event: any) => {
    //   var papersgptState = Zotero.Prefs.get(`${config.addonRef}.papersgptState`)
    //   if (papersgptState === "Offline") {
    //     this.callback()
    //   } else if (papersgptState == "Online") {
    //     this.exit()
    //   } 
    // });
    const searchNode = toolbar.querySelector("#zotero-tb-search");
    newNode.style.listStyleImage = `url(chrome://${config.addonRef}/content/icons/papersgpt-logo.png)`;
    toolbar.insertBefore(newNode, searchNode);
  }

  public loadPromptSidebar() {
    // Load prompts!
    const loaded_prompts = Zotero.Prefs.get(`${config.addonRef}.prompts`) as string
    if (!loaded_prompts) {
        Zotero.Prefs.set(`${config.addonRef}.prompts`, JSON.stringify(default_prompt_list))
    }
    // try to parse the prompts. If it fails, set the default prompts
    let prompts: Prompt[] = []
    try {
        prompts = JSON.parse(loaded_prompts) as Prompt[]
    } catch {
        prompts = default_prompt_list
        Zotero.logError("Failed to parse prompts. Setting to default prompts!")
    }
    // prompts = default_prompt_list
    return prompts
  }


  public toggleSideBar() {
    const pluginName = "papersgpt-sidebar"; 
    const papersgptNode = Zotero.getMainWindow().document.querySelector("#" + pluginName)!;
    if (!papersgptNode) {
      return;
    }

    // toggle display status for the sidebar
    // if the sidebar is visible, hide it
    // if the sidebar is hidden, show it
    if (papersgptNode.style.display == "none") {
      papersgptNode.style.display = "block";
    } else {
      papersgptNode.style.display = "none";
    }

  }

  public async registerInSidebar() {
  const that = this;

  this.callback()

  //! 1.1 View for sidebar
  const pluginName = "papersgpt-sidebar"; 
  const papersgptNode = Zotero.getMainWindow().document.querySelector("#" + pluginName)!;
  if (papersgptNode) {
    return;
  }
  const tabs_deck = Zotero.getMainWindow().document.querySelector("#zotero-context-pane")!;
  const newNode = Zotero.getMainWindow().document.createElement("div");
  const tabs_deck_parent = tabs_deck.parentNode;
  tabs_deck_parent!.insertBefore(newNode, tabs_deck.nextSibling);
  newNode.setAttribute("id", pluginName);
  newNode.setAttribute("class", "papersgpt-sidebar");
  newNode.setAttribute("command", "");
  newNode.setAttribute("oncommand", "");
  newNode.setAttribute("mousedown", "");
  newNode.setAttribute("onmousedown", "");
  newNode.setAttribute("zotero-persist", "width");
  newNode.setAttribute("style", "font-size: 1rem; --zotero-font-size: 1.00rem; --zotero-ui-density: comfortable; margin: 1rem; background-color: #fff; display: none;"); // 添加 display: none
  newNode.setAttribute("zoteroFontSize", "small");
  newNode.setAttribute("zoteroUIDensity", "comfortable");
  newNode.setAttribute("class", "standard");

  const width = Zotero.Prefs.get(`${config.addonRef}.width`)
  newNode.style.width = '28%';
  
  // write 123 in the sidebar
  const modelIconUrl = `chrome://${config.addonRef}/content/icons/gpt.png`;
  const customModels = JSON.parse(String(Zotero.Prefs.get(`${config.addonRef}.customModels`) || '[]'));
  Zotero.Prefs.set(`${config.addonRef}.customModels`, JSON.stringify(customModels));
  const hasModels = customModels && customModels.length > 0;

  const modelSelectorHtml = `
    <div id="chat-input-model-selector" class="chat-input-buttoner" style="
      display: flex;
      align-items: center;
      padding: 4px 8px;  // 调整内边距
      margin: 0.2rem 0;
      border: 1px solid #e0e0e0;
      border-radius: 4px;
      cursor: pointer;
      background-color: #fff;
      width: 100%;
      font-size: 12px;
      height: fit-content;
      box-sizing: border-box;">
      <span class="model-name" style="
        color: #444;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        line-height: 1.2;">  // 移除文字padding
        ${hasModels ? (customModels[0]?.displayName || customModels[0]?.apimodel) : "Add Model"}
      </span>
      ${hasModels ? '<span style="margin-left: auto; color: #888; font-size: 10px;">▲</span>' : ''}
    </div>
  `;

  const inputPanelHtml = `
<div class="input-panel">
  <div id="input-panel-prompt-list" class="input-panel-prompt-list" style="display: flex; flex-wrap: wrap; margin: 0.5rem 0; padding: 2px;">
  </div>
  <label class="chat-input-panel-inner">
    <div style="display: flex; flex-direction: column; width: 100%; padding: 6px;">
      <textarea id="chat-input" class="chat-input" placeholder="Chat Bot by c7w :)" rows="3" style="
        font-size: 14px;
        width: 100%;
        margin-bottom: 0.3rem;  // 调整间距
        padding: 6px;  // 减小输入框内边距
        box-sizing: border-box;"></textarea>
      <div style="display: flex; flex-direction: row; align-items: center; gap: 0.3rem; justify-content: flex-end; padding: 2px;">
      ${modelSelectorHtml}
        <div id="chat-input-copyer" class="chat-input-buttoner" style="background-color:rgb(146, 168, 22); padding: 4px 8px;">
          <div aria-label="Copy" class="button_icon-button-text__my76e">Copy</div>
        </div>
        <div id="chat-input-clearer" class="chat-input-buttoner" style="background-color:#ff4444; padding: 4px 8px;">
          <div aria-label="Clear" class="button_icon-button-text__my76e">Clear</div>
        </div>
        <div id="chat-input-stopper" class="chat-input-buttoner" style="background-color:#DC3545; padding: 4px 8px; display:none;">
          <div aria-label="Stop" class="button_icon-button-text__my76e">Stop</div>
        </div>
        <div id="chat-input-buttoner" class="chat-input-buttoner" style="padding: 4px 8px;">
          <div aria-label="send" class="button_icon-button-text__my76e">Send</div>
        </div>
      </div>
    </div>
  </label>
</div>`;

  newNode.innerHTML = `<div style="display: flex; height: 100%;">
    <div style="display: flex; justify-content: center; align-items: center; flex-direction: column; height: 100%; flex: 1; position: relative;">
        <div class="resize-handle" style="position: absolute; left: -5px; width: 10px; height: 100%; cursor: ew-resize; background-color: transparent;"></div>
        <div class="sidebar-answer" id="sidebar-answer" style="display: flex; flex-direction: column; width: 100%; height: calc(100% - 120px); overflow-y: auto; padding: 10px; box-sizing: border-box;">
            <!-- 移除静态的欢迎消息 -->
        </div>
        ${inputPanelHtml}
    </div>
</div>`;

  // 在HTML加载完成后,初始化model selector的当前值
  const modelNameSpan = newNode.querySelector(".model-name");
  if (modelNameSpan) {
    // 获取当前模型配置
    const customModels = JSON.parse(String(Zotero.Prefs.get(`${config.addonRef}.customModels`) || '[]'));
    const currentModelId = Zotero.Prefs.get(`${config.addonRef}.usingModel`) as string;
    
    // 查找当前模型的配置
    const currentModel = customModels.find((model: any) => model.apimodel === currentModelId);
    
    // 使用 displayName 或 fallback 到 apimodel
    modelNameSpan.textContent = currentModel?.displayName || currentModel?.apimodel || "Add new model";
  }

  // Add resize functionality
  const resizeHandle = newNode.querySelector('.resize-handle') as HTMLDivElement;
  let isResizing = false;
  let startX: number;
  let startWidth: number;

  resizeHandle.addEventListener('mousedown', (e) => {
    isResizing = true;
    startX = e.clientX;
    startWidth = newNode.offsetWidth;

    // Add temporary event listeners
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  });

  const handleMouseMove = (e: MouseEvent) => {
    if (!isResizing) return;

    const dx = startX - e.clientX;
    const newWidth = startWidth + dx;
    
    // Get parent width for percentage calculation
    const parentWidth = document.documentElement.clientWidth;
    const widthPercentage = (newWidth / parentWidth) * 100;

    // If width is less than 15%, hide the sidebar
    if (widthPercentage < 5) {
      newNode.style.display = 'none';
      isResizing = false;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      return;
    }

    // Limit maximum width to 50%
    if (widthPercentage <= 50) {
      newNode.style.width = `${widthPercentage}%`;
    }
  };

  const handleMouseUp = () => {
    isResizing = false;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
    
    // Save the new width to preferences if sidebar is visible
    if (newNode.style.display !== 'none') {
      const width = parseFloat(newNode.style.width);
      Zotero.Prefs.set(`${config.addonRef}.width`, `${width}%`);
    }
  };

  // Add hover effect for resize handle
  resizeHandle.addEventListener('mouseover', () => {
    resizeHandle.style.backgroundColor = 'rgba(0,0,0,0.1)';
  });

  resizeHandle.addEventListener('mouseout', () => {
    if (!isResizing) {
      resizeHandle.style.backgroundColor = 'transparent';
    }
  });

  //! 1.2 Stylesheets for sidebar
  ztoolkit.UI.appendElement({
    tag: "style",
    id: `${config.addonRef}-style`,
    namespace: "html",
    properties: {
      innerHTML: newly_added_css}}, document.documentElement);

  //! 2. Execution of the sidebar
  const executeSidebar = async (prompt: Prompt) => {
    //! 2.1. mutex lock
    if (this.isInference) {
      return 
    }
    this.isInference = true
    
    // 显示停止按钮，隐藏发送按钮
    const sendButton = document.querySelector("#chat-input-buttoner") as HTMLElement;
    const stopButton = document.querySelector("#chat-input-stopper") as HTMLElement;
    if (sendButton && stopButton) {
        sendButton.style.display = "none";
        stopButton.style.display = "flex";
    }
    
    //! building the prompt
    let original_prompt = prompt.prompt;
    let pdf_selection = Meet.Zotero.getPDFSelection();

    // fetch from chat input. if input has value, overwrite pdf_selection
    const chat_input = document.querySelector("#chat-input") as HTMLTextAreaElement;
    if (chat_input.value) {
      original_prompt = chat_input.value;
      chat_input.value = "";
    }

    let final_input_text = original_prompt;
    if (prompt.read_selection) {
      final_input_text = `${original_prompt}\n${pdf_selection}`;
    } else {
      final_input_text = `${original_prompt}`;
    }

    // 添加用户消息到历史并显示
    this.messages.push({
      role: "user", 
      content: final_input_text
    });
    
    // 显示用户消息
    this.setText(final_input_text, true, true, false);
    
    // 添加一个临时的助手消息（思考中）
    const thinkingMsg = {
      role: "assistant",
      content: "思考中..."
    };
    this.messages.push(thinkingMsg);
    this.setText(thinkingMsg.content, false, true, false);
    
    // 发送请求获取回复
    const output_text = await Meet.integratellms.getGPTResponse(final_input_text) as string;
    
    // 更新助手消息内容
    this.messages[this.messages.length - 1].content = output_text;
    
    // 只需要更新显示一次，删除重复的更新代码
    this.setText(output_text, true, true, false);
    
    this.isInference = false;
    
    // 恢复按钮状态
    if (sendButton && stopButton) {
        sendButton.style.display = "flex";
        stopButton.style.display = "none";
    }
  }
  
  //! 3 Dynamic Rendering
  //! 3.1 Rendering the tags
  const input_panel_prompt_list = document.querySelector("#input-panel-prompt-list") as HTMLDivElement;
  const loaded_prompts = this.loadPromptSidebar();
  const render_prompt = (prompt: Prompt) => {
    // <div class="input-panel-prompt" style="margin: 0.2rem; padding: 0.2rem; border-radius: 10px; background-color: #1d93ab; color: #fff; cursor: pointer;">Chat PDF</div>
    const promptNode = ztoolkit.UI.appendElement({tag: "div", classList: ["input-panel-prompt"], styles: {margin: "0.2rem", padding: "0.2rem", borderRadius: "10px", backgroundColor: prompt.display.color, color: "#fff", cursor: "pointer"}, properties: {innerText: prompt.name}, listeners: [{type: "click", listener: async () => { 
      executeSidebar(prompt);
    }}]}, input_panel_prompt_list) as HTMLDivElement;
    input_panel_prompt_list.appendChild(promptNode);
    return promptNode;
  };
  // sort the prompts by prompt.display.priority
  loaded_prompts.sort((a, b) => a.display.priority - b.display.priority);
  loaded_prompts.forEach(render_prompt);


  //! 3.2 Action for the sending button and input handling
  const chatInput = document.querySelector("#chat-input") as HTMLTextAreaElement;
  
  // Add keydown event listener for enter/shift+enter
  chatInput?.addEventListener("keydown", async (event) => {
    if (event.key === "Enter") {
      // Shift + Enter for new line
      if (event.shiftKey) {
        return; // Default behavior - insert newline
      }
      
      // Enter to send
      event.preventDefault();
      const text = chatInput.value.trim();
      if (text.length > 0) {
        await executeSidebar({
          name: "Send", 
          prompt: text, 
          display: {
            color: "#1d93ab", 
            priority: 0
          }, 
          read_selection: true, 
          description: "Send the text to the AI model."
        });
        chatInput.value = "";
      }
    }
  });

  // Keep existing click handler as fallback
  document.querySelector("#chat-input-buttoner")?.addEventListener("mouseup", async (event) => {
    const text = chatInput.value.trim();
    if (text.length > 0) {
      await executeSidebar({
        name: "Send",
        prompt: text,
        display: {color: "#1d93ab", priority: 0},
        read_selection: true,
        description: "Send the text to the AI model."
      });
      chatInput.value = "";
    }
  });

  //! 3.2.1 Action for the model selector button
  const modelSelector = newNode.querySelector("#chat-input-model-selector");
  modelSelector?.addEventListener("mouseup", async (event) => {
    const that = this;
    const customModels = JSON.parse(String(Zotero.Prefs.get(`${config.addonRef}.customModels`) || '[]'));
    
    // 如果没有模型，直接显示添加模型对话框
    if (!customModels || customModels.length === 0) {
      this.showNewModelDialog();
      return;
    }

    // 有模型时显示下拉菜单
    const rect = modelSelector.getBoundingClientRect();
    const currentModel = Zotero.Prefs.get(`${config.addonRef}.usingModel`) as string;
    Zotero.log(`Available models: ${JSON.stringify(customModels)}`);

    // 修改菜单项映射，使用 displayName 作为显示名称
    const items = customModels.map((e: any) => ({
      name: e.displayName || e.apimodel, // 优先使用 displayName 作为显示名称
      apimodel: e.apimodel, // 保留实际的模型名称用于API调用
      isSelected: currentModel === e.apimodel,
      listener: async () => {
        try {
          // 使用 apimodel 而不是 displayName 进行设置
          Zotero.Prefs.set(`${config.addonRef}.usingModel`, e.apimodel);
          Zotero.Prefs.set(`${config.addonRef}.usingAPIURL`, e.apiurl);
          Zotero.Prefs.set(`${config.addonRef}.usingAPIKEY`, e.apikey);

          await new Promise(resolve => setTimeout(resolve, 100));
          
          const newModel = Zotero.Prefs.get(`${config.addonRef}.usingModel`);
          Zotero.log(`${config.addonRef}.usingModel: ${newModel}`);
          
          // 更新显示名称
          const modelNameSpan = modelSelector.querySelector(".model-name");
          if (modelNameSpan) {
            modelNameSpan.textContent = e.displayName || e.apimodel;
          }

          if (!that.publisher2models.has(e.apimodel)) {
            const modelConfig: ModelConfig = {
              models: [e.apimodel],
              hasApiKey: true,
              apiKey: e.apikey,
              areModelsReady: new Map([[e.apimodel, true]]),
              defaultModelIdx: 0,
              apiUrl: e.apiurl,
              displayName: e.displayName // 添加显示名称到配置中
            };
            that.publisher2models.set(e.apimodel, modelConfig);
          } else {
            const modelConfig = that.publisher2models.get(e.apimodel);
            if (modelConfig) {
              modelConfig.apiKey = e.apikey;
              modelConfig.apiUrl = e.apiurl;
              modelConfig.defaultModelIdx = 0;
              modelConfig.displayName = e.displayName; // 更新显示名称
            }
          }
          
          Meet.Global.resetModelConfig && Meet.Global.resetModelConfig();
          that.createOrUpdateModelsContainer();
          
          Zotero.log("Model switch completed, configuration updated");
        } catch (error) {
          Zotero.log(`Error switching model: ${error}`);
        }
      }
    }));

    // 显示下拉菜单
    this.showModelMenu(items, rect);
  });

  //! 3.3 Action for the copy button
  document.querySelector("#chat-input-copyer")?.addEventListener("mouseup", async (event) => {
    const inputNode = document.querySelector("#sidebar-answer") as HTMLDivElement;
    const text = inputNode.getAttribute("pureText") as string;
    if (text.length > 0) {
      await new ztoolkit.Clipboard()
      .addText(text, "text/unicode")
      .copy()
    }
  });

  // 添加清空按钮事件监听
  document.querySelector("#chat-input-clearer")?.addEventListener("mouseup", async (event) => {
    // 使用 window.confirm 替代 confirm
    if (window.confirm("确定要清空所有聊天历史记录吗？")) {
        this.clearChatHistory();
    }
  });

  // 添加滑动浏览历史记录功能
  const answerDiv = document.querySelector("#sidebar-answer") as HTMLDivElement;
  if (answerDiv) {
    this.updateWelcomeMessage();
    // 记录上一次滚动位置和方向
    let lastScrollTop = 0;
    let scrollingUp = false;
    
    // 添加鼠标滚轮事件监听
    answerDiv.addEventListener('wheel', (event) => {
      // 当按住Ctrl键时，触发历史记录浏览
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        
        // 确定滚动方向
        scrollingUp = event.deltaY < 0;
        
        // 如果没有聊天历史，提示用户
        if (this.messages.length === 0) {
          const notification = document.createElement('div');
          notification.textContent = '没有聊天历史记录';
          notification.style.padding = '10px';
          notification.style.backgroundColor = '#f0f0f0';
          notification.style.borderRadius = '4px';
          notification.style.textAlign = 'center';
          notification.style.margin = '10px 0';
          
          answerDiv.appendChild(notification);
          
          setTimeout(() => {
            notification.remove();
          }, 2000);
          
          return;
        }
        
        // 调用历史记录浏览方法
        this.scrollChatHistory(scrollingUp ? 'up' : 'down');
      }
    });
    
    // 添加触摸手势支持（针对触摸屏和触控板）
    let touchStartY = 0;
    
    answerDiv.addEventListener('touchstart', (event) => {
      if (event.touches.length === 2) { // 双指触摸
        touchStartY = event.touches[0].clientY;
      }
    }, { passive: false });
    
    answerDiv.addEventListener('touchmove', (event) => {
      if (event.touches.length === 2) { // 双指触摸
        event.preventDefault();
        
        const touchY = event.touches[0].clientY;
        const deltaY = touchY - touchStartY;
        
        // 如果移动距离足够大，触发历史记录浏览
        if (Math.abs(deltaY) > 30) {
          scrollingUp = deltaY > 0;
          this.scrollChatHistory(scrollingUp ? 'up' : 'down');
          touchStartY = touchY; // 重置起始位置
        }
      }
    }, { passive: false });
  }

  // 在侧边栏中添加停止按钮的事件监听器
  document.querySelector("#chat-input-stopper")?.addEventListener("mouseup", async (event) => {
      if (this.isInference) {
          this.stopGeneration();
      }
  });

}


  public async registerInMenupopup() {
    var showText = "Toggle Hide/Display of sidebar @ papersgpt-sidebar"
    if (Zotero.isMac) {
      showText = "Toggle Hide/Display of sidebar @ papersgpt-sidebar"
    }

    const waitTime = 5000 
    let delayCount = 0;
    const checkPeriod = 50;

    let reader = Zotero.Reader.getByTabID(Zotero_Tabs.selectedID)
    let pageDownNode = null
     
    let readerInit = false
    while ((!reader || !pageDownNode) && delayCount * checkPeriod < waitTime) {
      if (reader) {
        if (!readerInit) {
	  await reader._initPromise;
	  readerInit = true
	}	
	if (!pageDownNode) {
          await Zotero.Promise.delay(checkPeriod);
	  pageDownNode = reader?._iframeWindow?.document.querySelector("#zoomOut")
	}
      } else {
        await Zotero.Promise.delay(checkPeriod);
	reader = Zotero.Reader.getByTabID(Zotero_Tabs.selectedID)
      }
      delayCount++; 
    } 
   
    const toolbarid = "papersgpt-toolbar-" + Zotero_Tabs.selectedID
    const papersgptNode = reader?._iframeWindow?.document.getElementById(toolbarid)
    if (papersgptNode) {
      return 
    }
    const newNode = pageDownNode?.cloneNode(true) as XUL.ToolBarButton;
  //   set inner HTML to <svg width="20" height="20" xmlns="http://www.w3.org/2000/svg">
  //   <polygon points="10,2 18,18 2,18" fill="blue" />
  // </svg>

    newNode.innerHTML = `<svg width="20" height="20" xmlns="http://www.w3.org/2000/svg"><polygon points="10,2 18,18 2,18" fill="blue" /></svg>`

    newNode.setAttribute("id", toolbarid);
    if (Zotero.isMac) {
      newNode.setAttribute("title", "Chat PDF with ChatGPT, Claude, Gemini and Local LLMs");
    } else {
      newNode.setAttribute("title", "Chat PDF with ChatGPT, Claude, Gemini");
    }
    newNode.setAttribute("command", "");
    newNode.setAttribute("oncommand", "");
    newNode.setAttribute("mousedown", "");
    newNode.setAttribute("onmousedown", "");

    Zotero.log(newNode.innerHTML)


    newNode.disabled = false; 
    // newNode.innerHTML = "";
    // let img = reader?._iframeWindow?.document.createElement('img')
    // img.src = `url(chrome://${config.addonRef}/content/icons/papersgpt-logo.png)`;
    // img.alt = ''
    // newNode.appendChild(img);

    newNode.addEventListener("click", async () => {
      this.toggleSideBar()
    });

    // wait for 1 seconds and then call this.callback()
    // window.setTimeout(() => {
    // }, 3000)

    const parentNode = reader?._iframeWindow?.document.querySelector(".start")

    const inputNode =  reader?._iframeWindow?.document.querySelector(".toolbar-text-input")
    parentNode.insertBefore(newNode, inputNode);
  }

  private async callback() {
    this.publisher2models.clear();
    this.publishers = [];

    // 加载自定义模型配置
    const customModels = JSON.parse(String(Zotero.Prefs.get(`${config.addonRef}.customModels`) || '[]'));
    const hasModels = customModels && customModels.length > 0;
    
    // 检查是否已有模型，避免重复添加
    const existingModels = customModels.map((model: any) => model.apimodel);
    
    // 保存更新后的模型列表
    Zotero.Prefs.set(`${config.addonRef}.customModels`, JSON.stringify(customModels));
    
    // 遍历所有模型配置并添加到系统中
    customModels.forEach((config: any) => {
      const modelConfig: ModelConfig = {
        models: [config.apimodel],
        hasApiKey: true,
        apiKey: config.apikey,
        areModelsReady: new Map([[config.apimodel, true]]),
        defaultModelIdx: 0,
        apiUrl: config.apiurl,
        displayName: config.displayName // 添加显示名称
      };
      this.publisher2models.set(config.apimodel, modelConfig);
      this.publishers.push(config.apimodel);
    });

    // 只有在有模型时才设置当前使用的模型
    if (customModels.length > 0) {
      const firstConfig = customModels[0];
      
      // 设置模型配置
      Zotero.Prefs.set(`${config.addonRef}.usingModel`, firstConfig.apimodel);
      Zotero.Prefs.set(`${config.addonRef}.usingAPIURL`, firstConfig.apiurl);
      Zotero.Prefs.set(`${config.addonRef}.usingAPIKEY`, firstConfig.apikey);
      
      // 更新界面上的模型名称显示 - 使用 displayName
      const modelNameSpan = document.querySelector(".model-name");
      if (modelNameSpan) {
        // 确保使用 displayName
        modelNameSpan.textContent = firstConfig.displayName || 'nonono'
      }

      // 更新侧边栏的模型名称显示
      const sidebarModelName = document.querySelector("#chat-input-model-selector .model-name");
      if (sidebarModelName) {
        sidebarModelName.textContent = firstConfig.displayName || firstConfig.apimodel;
      }
    }
    
    // 添加调试日志
    Zotero.log(`Added ${customModels.length} model configurations`);
    Zotero.log(`Current model in use: ${customModels[0]?.displayName || customModels[0]?.apimodel}`);

    // 更新下拉箭头的显示状态
    const modelSelector = document.querySelector("#chat-input-model-selector");
    if (modelSelector) {
      // 先移除现有的箭头（如果存在）
      const existingArrow = modelSelector.querySelector("span:last-child");
      if (existingArrow && existingArrow !== modelSelector.querySelector(".model-name")) {
        existingArrow.remove();
      }

      // 如果有模型，添加箭头
      if (hasModels) {
        const arrow = document.createElement("span");
        Object.assign(arrow.style, {
          marginLeft: "auto", 
          color: "#888"
        });
        arrow.textContent = "▲";
        modelSelector.appendChild(arrow);
      }
    }

    // 更新模型名称显示
    const modelNameSpan = document.querySelector(".model-name");
    if (modelNameSpan) {
      if (hasModels) {
        const firstConfig = customModels[0];
        modelNameSpan.textContent = firstConfig.displayName || firstConfig.apimodel;
      } else {
        modelNameSpan.textContent = "Add New Model";
      }
    }
  }


  /**
   * Bind shortcut key 
   */
  private registerKey() {
    const key = "enter"
    if (Zotero.isMac) {
      const modifiers = "meta"
      ztoolkit.Shortcut.register((ev, data) => {
        if (data.type === "keyup" && data.keyboard) {
          if (data.keyboard.equals(`${modifiers},${key}`)) {
            var papersgptState = Zotero.Prefs.get(`${config.addonRef}.papersgptState`)
	    if (papersgptState == "Offline") {
              this.callback() 
	    } 
          }
        }
      })
    } else {
      const modifiers = "control"
      ztoolkit.Shortcut.register((ev, data) => {
        if (data.type === "keyup" && data.keyboard) {
          if (data.keyboard.equals(`${modifiers},${key}`)) {
            var papersgptState = Zotero.Prefs.get(`${config.addonRef}.papersgptState`)
            if (papersgptState == "Offline") {
	      this.callback() 
	    }
          }
        }
      })
    }

  // Register ctrl+c. Zotero.log event.explicitOriginalTarget.baseURI
  // Register ctrl+c. Zotero.log event.explicitOriginalTarget.baseURI
  document.addEventListener("keydown", (ev) => {
    const data = ev; // Use ev as data for consistency
    if (data.ctrlKey && data.key === 'c') {
      // get sidebar-answer text
      const sidebarAnswer = document.querySelector("#sidebar-answer") as HTMLDivElement;
      // get its window
      const win = sidebarAnswer.ownerDocument.defaultView;
      let selection = win.getSelection();
      if (!selection) {
        console.error("No selection found.");
        return;
      }

      if (selection.toString().length > 0) {
        Zotero.warn(selection.toString());
        let range = selection.getRangeAt(0);
        if (!range) {
          console.error("No range found in selection.");
          return;
        }
        let docFragment = range.cloneContents();
        Zotero.warn(selection.rangeCount+1);
        // Create a temporary container to hold the fragment
        let tempDiv = document.createElement("div");
        tempDiv.appendChild(docFragment);
  
        // Copy the HTML content of the temporary container
        let htmlContent = tempDiv;

        Zotero.warn(htmlContent);
        Zotero.warn(selection.rangeCount+2);
        var TurndownService = require('turndown')
        var turndownService = new TurndownService({headingStyle: "atx"});
        var markdown = turndownService.turndown(htmlContent)
        // wait for 100 milliseconds and then copy the selection
        setTimeout(async () => {

          await new ztoolkit.Clipboard()
            .addText(markdown, "text/unicode")
            .copy();
        }, 100);
      }
      // Additional logic for ctrl+c can be added here
    }
  });

    
    document.addEventListener(
      "keydown",
      async (event: any) => {
        if (
          Zotero_Tabs.selectedIndex == 1 &&
          event.explicitOriginalTarget.baseURI.indexOf("note-editor") >= 0 &&
          event.code == "Space" &&
          Zotero.BetterNotes.api.editor
        ) {
          this.isInNote = true
          const doc = event.explicitOriginalTarget.ownerDocument
          let selection = doc.getSelection()
          let range = selection.getRangeAt(0);
          const span = range.endContainer
          let text = await Meet.BetterNotes.getEditorText(span)
          // ztoolkit.log(text)
          this.messages = [{
            role: "user",
            content: text
          }]
          if (/[\n ]+/.test(span.innerText)) {
            Meet.BetterNotes.follow(span)
            event.preventDefault();
          }
          return 
        }
        if (
          (event.shiftKey && event.key.toLowerCase() == "?") ||
          (event.key == "/" && Zotero.isMac)) {
          if (
            event.originalTarget.isContentEditable ||
            "value" in event.originalTarget
          ) {
            return
          }
          
        }
      },
      true
    );
  }

  private showModelMenu(items: any[], rect: DOMRect) {
    const doc = Zotero.getMainWindow().document;
    
    // 移除可能存在的旧菜单
    const existingMenu = doc.querySelector(".model-menu-wrapper");
    if (existingMenu) {
      existingMenu.remove();
    }
    
    // 创建菜单容器
    const menuWrapper = doc.createElement("div") as HTMLDivElement;
    menuWrapper.className = "model-menu-wrapper";

    // 计算每个菜单项的高度和总高度
    const itemHeight = 40; // 每个菜单项的高度
    const menuHeight = ((items?.length || 0) + 1) * itemHeight; // +1 是为添加新模型选项
    
    // 始终将菜单定位在按钮上方
    Object.assign(menuWrapper.style, {
      position: "fixed",
      left: `${rect.left}px`,
      bottom: `${window.innerHeight - rect.top + 4}px`, // 定位到按钮上方
      width: `${rect.width}px`,
      maxHeight: `${Math.min(menuHeight, window.innerHeight * 0.8)}px`, // 限制最大高度
      backgroundColor: "#ffffff",
      border: "1px solid #e0e0e0",
      borderRadius: "4px",
      boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
      zIndex: "9999",
      overflowY: "auto" // 如果内容过多则显示滚动条
    });

    // 如果有现有模型，添加模型列表
    if (items && items.length > 0) {
      // 添加现有模型列表
      items.forEach(item => {
        const itemNode = doc.createElement("div") as HTMLDivElement;
        Object.assign(itemNode.style, {
          padding: "8px 12px",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          backgroundColor: item.isSelected ? "#f0f0f0" : "#ffffff",
          color: item.isSelected ? "#1d93ab" : "#444",
          transition: "background-color 0.2s",
          fontSize: "13px",
          borderBottom: "1px solid #f0f0f0"
        });
        
        // 修改菜单项的 HTML 结构，添加删除按钮
        itemNode.innerHTML = `
          <span style="flex-grow: 1;">${item.name}</span>
          <div style="display: flex; align-items: center; gap: 8px;">
            ${item.isSelected ? '<span style="color: #1d93ab;">✓</span>' : ''}
            <span class="delete-btn" style="color: #ff4444; padding: 0 4px; opacity: 0; transition: opacity 0.2s;">✕</span>
          </div>
        `;

        // 鼠标悬停效果
        itemNode.addEventListener("mouseenter", () => {
          itemNode.style.backgroundColor = "#f5f5f5";
          const deleteBtn = itemNode.querySelector(".delete-btn") as HTMLElement;
          if (deleteBtn) {
            deleteBtn.style.opacity = "1";
          }
        });

        itemNode.addEventListener("mouseleave", () => {
          itemNode.style.backgroundColor = item.isSelected ? "#f0f0f0" : "#ffffff";
          const deleteBtn = itemNode.querySelector(".delete-btn") as HTMLElement;
          if (deleteBtn) {
            deleteBtn.style.opacity = "0";
          }
        });

        // 点击事件处理
        itemNode.addEventListener("click", async (e) => {
          const target = e.target as HTMLElement;
          // 如果点击的是删除按钮
          if (target.classList.contains("delete-btn")) {
            e.stopPropagation(); // 阻止冒泡，避免触发选择事件

            // 获取当前模型配置
            const customModels = JSON.parse(String(Zotero.Prefs.get(`${config.addonRef}.customModels`) || '[]'));
            
            // 从配置中移除该模型
            const updatedModels = customModels.filter((model: any) => model.apimodel !== item.apimodel);
            
            // 保存更新后的配置
            Zotero.Prefs.set(`${config.addonRef}.customModels`, JSON.stringify(updatedModels));

            // 如果删除的是当前选中的模型，则重置当前模型
            if (item.isSelected) {
              const firstModel = updatedModels[0];
              if (firstModel) {
                Zotero.Prefs.set(`${config.addonRef}.usingModel`, firstModel.apimodel);
                Zotero.Prefs.set(`${config.addonRef}.usingAPIURL`, firstModel.apiurl);
                Zotero.Prefs.set(`${config.addonRef}.usingAPIKEY`, firstModel.apikey);
              } else {
                // 如果没有其他模型了，清空当前模型设置
                Zotero.Prefs.clear(`${config.addonRef}.usingModel`);
                Zotero.Prefs.clear(`${config.addonRef}.usingAPIURL`);
                Zotero.Prefs.clear(`${config.addonRef}.usingAPIKEY`);
              }
            }

            // 更新界面
            this.callback();
            menuWrapper.remove();

            // 显示删除成功消息
            new ztoolkit.ProgressWindow("Remove Model")
              .createLine({ text: "Model configuration has been removed", type: "success" })
              .show();

            return;
          }

          // 常规点击处理（选择模型）
          try {
            await item.listener();
          } catch (error) {
            Zotero.log(`Error in model selection: ${error}`);
          }
          menuWrapper.remove();
        });

        menuWrapper.appendChild(itemNode);
      });

      // 添加分隔线
      const separator = doc.createElement("div") as HTMLDivElement;
      Object.assign(separator.style, {
        height: "1px",
        margin: "8px 0",
        backgroundColor: "#e0e0e0"
      });
      menuWrapper.appendChild(separator);
    }

    // 添加"新建模型"选项
    const newModelItem = doc.createElement("div") as HTMLDivElement;
    Object.assign(newModelItem.style, {
      padding: "8px 12px",
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      backgroundColor: "#ffffff",
      color: "#1d93ab",
      transition: "background-color 0.2s",
      fontSize: "13px"
    });
    
    newModelItem.innerHTML = `
      <span style="flex-grow: 1;">➕ ${items?.length ? 'Add New Model' : 'Add Your First Model'}</span>  
    `;

    newModelItem.addEventListener("mouseenter", () => {
      newModelItem.style.backgroundColor = "#f5f5f5";
    });

    newModelItem.addEventListener("mouseleave", () => {
      newModelItem.style.backgroundColor = "#ffffff";
    });

    newModelItem.addEventListener("click", () => {
      this.showNewModelDialog();
      menuWrapper.remove();
    });

    menuWrapper.appendChild(newModelItem);

    // 添加到文档中
    doc.documentElement.appendChild(menuWrapper);

    // 处理点击外部关闭菜单
    const closeMenu = (e: MouseEvent) => {
      if (!menuWrapper.contains(e.target as Node)) {
        menuWrapper.remove();
        doc.removeEventListener("click", closeMenu);
      }
    };

    // 延迟添加事件监听器
    setTimeout(() => {
      doc.addEventListener("click", closeMenu);
    }, 100);
}

private showNewModelDialog() {
    const doc = Zotero.getMainWindow().document;
    
    // 创建背景遮罩
    const overlay = doc.createElement("div") as HTMLDivElement;
    Object.assign(overlay.style, {
      position: "fixed",
      left: "0",
      top: "0",
      width: "100%",
      height: "100%",
      backgroundColor: "rgba(0,0,0,0.5)",
      zIndex: "9999"
    });

    // 创建对话框容器
    const dialogWrapper = doc.createElement("div") as HTMLDivElement;
    Object.assign(dialogWrapper.style, {
      position: "fixed",
      left: "50%",
      top: "50%",
      transform: "translate(-50%, -50%)",
      backgroundColor: "#ffffff",
      padding: "20px",
      borderRadius: "8px",
      boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
      zIndex: "10000",
      width: "400px"
    });

    // 使用 createElement 而不是 innerHTML 来创建元素
    const header = doc.createElement("div");
    Object.assign(header.style, {
      marginBottom: "20px",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center"
    });

    const title = doc.createElement("h3");
    title.textContent = "Add New Model Configuration";  // 改为英文
    Object.assign(title.style, {
      margin: "0",
      color: "#333"
    });

    const closeBtn = doc.createElement("div");
    closeBtn.id = "dialog-close";
    closeBtn.textContent = "✕";
    Object.assign(closeBtn.style, {
      cursor: "pointer",
      padding: "4px 8px"
    });

    header.appendChild(title);
    header.appendChild(closeBtn);
    dialogWrapper.appendChild(header);

    // 创建表单字段
    const fields = [
      { id: "model-display-name", label: "Display Name", placeholder: "e.g. My GPT Model", type: "text" },
      { id: "model-name", label: "Model Name", placeholder: "e.g. gpt-4", type: "text" },
      { id: "model-url", label: "API URL", placeholder: "e.g. https://api.openai.com/v1/chat/completions", type: "text" },
      { id: "model-key", label: "API Key", placeholder: "Enter API Key", type: "password" }
    ];

    fields.forEach(field => {
      const container = doc.createElement("div");
      Object.assign(container.style, {
        marginBottom: "15px"
      });

      const label = doc.createElement("label");
      label.textContent = field.label;
      Object.assign(label.style, {
        display: "block",
        marginBottom: "5px",
        color: "#666"
      });

      const input = doc.createElement("input");
      input.id = field.id;
      input.type = field.type;
      input.placeholder = field.placeholder;
      Object.assign(input.style, {
        width: "100%",
        padding: "8px",
        border: "1px solid #ddd",
        borderRadius: "4px",
        boxSizing: "border-box"
      });

      container.appendChild(label);
      container.appendChild(input);
      dialogWrapper.appendChild(container);
    });

    // 创建错误消息容器
    const errorMessage = doc.createElement("div");
    errorMessage.id = "error-message";
    Object.assign(errorMessage.style, {
      color: "#ff4444",
      marginBottom: "15px",
      display: "none"
    });
    dialogWrapper.appendChild(errorMessage);

    // 创建按钮容器
    const buttonContainer = doc.createElement("div");
    Object.assign(buttonContainer.style, {
      display: "flex",
      justifyContent: "flex-end",
      gap: "10px"
    });

    const cancelBtn = doc.createElement("button");
    cancelBtn.id = "cancel-btn";
    cancelBtn.textContent = "Cancel";  // 改为英文
    Object.assign(cancelBtn.style, {
      padding: "8px 16px",
      border: "1px solid #ddd",
      borderRadius: "4px",
      background: "#fff",
      cursor: "pointer"
    });

    const saveBtn = doc.createElement("button");
    saveBtn.id = "save-btn";
    saveBtn.textContent = "Save";  // 改为英文
    Object.assign(saveBtn.style, {
      padding: "8px 16px",
      border: "none",
      borderRadius: "4px",
      background: "#1d93ab",
      color: "#fff",
      cursor: "pointer"
    });

    buttonContainer.appendChild(cancelBtn);
    buttonContainer.appendChild(saveBtn);
    dialogWrapper.appendChild(buttonContainer);

    // 添加事件监听器
    const closeDialog = () => {
      overlay.remove();
      dialogWrapper.remove();
    };

    const showError = (message: string) => {
      errorMessage.textContent = message;
      errorMessage.style.display = "block";
      setTimeout(() => {
        errorMessage.style.display = "none";
      }, 3000);
    };

    const saveNewModel = () => {
      const displayName = (doc.getElementById("model-display-name") as HTMLInputElement).value.trim();
      const modelName = (doc.getElementById("model-name") as HTMLInputElement).value.trim();
      const apiUrl = (doc.getElementById("model-url") as HTMLInputElement).value.trim();
      const apiKey = (doc.getElementById("model-key") as HTMLInputElement).value.trim();

      if (!displayName || !modelName || !apiUrl || !apiKey) {
        showError("All fields are required");  // 改为英文
        return;
      }

      try {
        // 获取现有模型配置
        const customModels = JSON.parse(String(Zotero.Prefs.get(`${config.addonRef}.customModels`) || '[]'));
        
        // 检查是否已存在相同的模型名称
        if (customModels.some((model: any) => model.apimodel === modelName)) {
          showError("Model name already exists");  // 改为英文
          return;
        }

        // 添加新模型
        customModels.push({
          apimodel: modelName,
          displayName: displayName,
          apiurl: apiUrl,
          apikey: apiKey
        });

        // 保存更新后的配置
        Zotero.Prefs.set(`${config.addonRef}.customModels`, JSON.stringify(customModels));

        // 更新模型列表
        this.callback();
        
        // 关闭对话框
        closeDialog();
        
        // 显示成功消息
        new ztoolkit.ProgressWindow("Add Model", { closeTime: 1500 })  // 添加closeTime參數
          .createLine({ text: "New model configuration has been added", type: "success" })  // 改为英文
          .show();

      } catch (error) {
        showError(`Error adding new model configuration: ${error}`);  // 改为英文
      }
    };

    // 绑定事件监听器
    closeBtn.addEventListener("click", closeDialog);
    cancelBtn.addEventListener("click", closeDialog);
    saveBtn.addEventListener("click", saveNewModel);
    overlay.addEventListener("click", closeDialog);

    // 阻止点击对话框时关闭
    dialogWrapper.addEventListener("click", (e) => {
      e.stopPropagation();
    });

    // 添加到文档中
    doc.documentElement.appendChild(overlay);
    doc.documentElement.appendChild(dialogWrapper);

    // 聚焦第一个输入框
    (doc.getElementById("model-display-name") as HTMLInputElement).focus();
}

/**
 * 滑动浏览聊天历史记录
 * @param direction 'up' 向上滑动获取更旧的记录，'down' 向下滑动获取更新的记录
 */
public scrollChatHistory(direction: 'up' | 'down') {
  const answerDiv = document.querySelector("#sidebar-answer") as HTMLDivElement;
  const chatHistoryContainer = document.createElement('div');
  chatHistoryContainer.className = 'chat-history-container';
  chatHistoryContainer.style.maxHeight = '400px';
  chatHistoryContainer.style.overflowY = 'auto';
  chatHistoryContainer.style.border = '1px solid #e0e0e0';
  chatHistoryContainer.style.borderRadius = '4px';
  chatHistoryContainer.style.padding = '10px';
  chatHistoryContainer.style.margin = '10px 0';
  
  // 为每条消息创建显示元素
  this.messages.forEach((msg, index) => {
    const msgElement = document.createElement('div');
    msgElement.className = `message ${msg.role}`;
    msgElement.style.marginBottom = '10px';
    msgElement.style.padding = '8px';
    msgElement.style.borderRadius = '4px';
    msgElement.style.maxWidth = '80%';
    
    if (msg.role === 'user') {
      msgElement.style.marginLeft = 'auto';
      msgElement.style.backgroundColor = '#e6f7ff';
    } else {
      msgElement.style.backgroundColor = '#f5f5f5';
    }
    
    const roleLabel = document.createElement('div');
    roleLabel.className = 'role-label';
    roleLabel.textContent = msg.role === 'user' ? '用户' : '助手';
    roleLabel.style.fontWeight = 'bold';
    roleLabel.style.marginBottom = '4px';
    
    const content = document.createElement('div');
    content.className = 'message-content';
    content.textContent = msg.content;
    
    msgElement.appendChild(roleLabel);
    msgElement.appendChild(content);
    chatHistoryContainer.appendChild(msgElement);
  });
  
  const closeButton = document.createElement('button');
  closeButton.textContent = '关闭历史记录';
  closeButton.style.marginTop = '10px';
  closeButton.style.padding = '5px 10px';
  closeButton.style.borderRadius = '4px';
  closeButton.style.border = 'none';
  closeButton.style.backgroundColor = '#1d93ab';
  closeButton.style.color = 'white';
  closeButton.style.cursor = 'pointer';
  
  closeButton.addEventListener('click', () => {
    chatHistoryContainer.remove();
    closeButton.remove();
  });
  
  // 保存当前内容
  const currentContent = answerDiv.innerHTML;
  const currentPureText = answerDiv.getAttribute("pureText") || "";
  
  // 清空并显示历史记录
  answerDiv.innerHTML = '';
  answerDiv.appendChild(chatHistoryContainer);
  answerDiv.appendChild(closeButton);
  
  // 滚动到底部或顶部
  if (direction === 'down') {
    chatHistoryContainer.scrollTop = chatHistoryContainer.scrollHeight;
  } else {
    chatHistoryContainer.scrollTop = 0;
  }
  
  // 添加返回按钮
  const backButton = document.createElement('button');
  backButton.textContent = '返回当前对话';
  backButton.style.marginTop = '10px';
  backButton.style.marginRight = '10px';
  backButton.style.padding = '5px 10px';
  backButton.style.borderRadius = '4px';
  backButton.style.border = 'none';
  backButton.style.backgroundColor = '#4169e1';
  backButton.style.color = 'white';
  backButton.style.cursor = 'pointer';
  
  backButton.addEventListener('click', () => {
    answerDiv.innerHTML = currentContent;
    answerDiv.setAttribute("pureText", currentPureText);
  });
  
  answerDiv.insertBefore(backButton, closeButton);
}

/**
 * 清空聊天历史记录
 */
public clearChatHistory() {
    this.messages = [];
    const answerDiv = document.querySelector("#sidebar-answer") as HTMLDivElement;
    answerDiv.innerHTML = "";
    this.updateWelcomeMessage();
    new ztoolkit.ProgressWindow(config.addonName, { closeTime: 1000 }) // 添加closeTime參數
        .createLine({ text: "聊天歷史記錄已清空", type: "success" })
        .show();
}

// 在class Views中添加新的方法
private updateWelcomeMessage() {
    const answerDiv = document.querySelector("#sidebar-answer") as HTMLDivElement;
    const welcomeMsg = answerDiv.querySelector(".welcome-message") as HTMLDivElement;
    
    // 当没有消息时显示欢迎语
    if (this.messages.length === 0) {
        if (!welcomeMsg) {
            const welcome = document.createElement('div');
            welcome.className = 'welcome-message';
            Object.assign(welcome.style, {
                fontSize: "12px",
                textAlign: "center",
                color: "#888",
                margin: "10px 0"
            });
            welcome.textContent = "Start chatting about your papers! Powered by Daucloud.";
            answerDiv.prepend(welcome);
        }
    } else {
        // 有消息时移除欢迎语
        welcomeMsg?.remove();
    }
}

// 添加stopGeneration方法到Views类
public stopGeneration() {
    if (!this.isInference) return;
    
    // 停止所有输出
    this.stopAlloutput();
    
    // 重置UI状态
    this.isInference = false;
    this.dotsContainer?.classList.remove("loading");
    
    // 添加检查避免空引用错误
    if (this.inputContainer) {
        // 切换按钮显示
        const sendMsgNode = this.inputContainer.querySelector(".send-msgs-icon") as HTMLElement;
        const stopMsgNode = this.inputContainer.querySelector(".stop-msgs-icon") as HTMLElement;
        
        if (sendMsgNode && stopMsgNode) {
            sendMsgNode.style.display = "flex";
            stopMsgNode.style.display = "none";
        }
    } else {
        // 侧边栏的停止按钮处理
        const sendButton = document.querySelector("#chat-input-buttoner") as HTMLElement;
        const stopButton = document.querySelector("#chat-input-stopper") as HTMLElement;
        if (sendButton && stopButton) {
            sendButton.style.display = "flex";
            stopButton.style.display = "none";
        }
    }
    
    // 在当前输出末尾添加提示
    const lastOutput = this.messages[this.messages.length - 1];
    if (lastOutput && lastOutput.role === "assistant") {
        lastOutput.content += "\n\n[输出已中断]";
        this.setText(lastOutput.content, true, true, false);
    }
    
    // 显示提示消息
    new ztoolkit.ProgressWindow("停止生成", { closeTime: 1000 })
        .createLine({ text: "已停止模型輸出", type: "default" })
        .show();
}
}

