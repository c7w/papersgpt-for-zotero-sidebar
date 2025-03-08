import { Document } from "langchain/document";
import { Views, sleep } from "../views";
import { config } from "../../../package.json";

export class ModelConfig {
	public models: string[] = [];
	public hasApiKey: boolean = true;
	public apiKey: string = "";
        public areModelsReady: Map<string, boolean> = new Map();
        public defaultModelIdx: number = 0;
        public apiUrl: string = "";	
        public displayName: string = "";
}


export async function search(publisher: string, model: string,
			     docid: string, queryText: string, 
			     topn: number, embeddingModel: string,
			     packFields: string) {
  var relatedDocs: Document[] = []
  const url = `http://localhost:9080/search`
  let res 
  const views = Zotero.PapersGPT.views as Views

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
	      publisher: publisher,  
		model: model,
                doc_id: docid,
                query: queryText,
		topn: topn,
		show_fields: packFields
            }),
          }
        )
  } catch (error: any) {
	try {
          error = error.xmlhttp.response?.error
          views.setText(`# ${error.code}\n> ${url}\n\n**${error.type}**\n${error.message}`, true)
          new ztoolkit.ProgressWindow(error.code, { closeOtherProgressWindows: true })
            .createLine({ text: error.message, type: "default" })
            .show()
        } catch {
          new ztoolkit.ProgressWindow("Error", { closeOtherProgressWindows: true })
            .createLine({ text: error.message, type: "default" })
            .show()
        }
  }

  if (res?.response?.Fields) {
      var fields_array = packFields.split(':')
      const fields_num = fields_array.length
      if (fields_num > 0) {
	     const docs_num = res.response.Fields[fields_array[0]].length
	     if (fields_num == 3) { // selected items
		     for (let i = 0; i < docs_num; i++) {
			     relatedDocs.push(
				     new Document({
					     pageContent: res.response.Fields["text-string"][i],
					     metadata: {
						     type: res.response.Fields["type-string"][i],
						     id: res.response.Fields["id-int"][i], 
					     },
				     }))
		     }
	     } else if (fields_num == 7) { // pdf2documents
		     for (let i = 0; i < docs_num; i++) {
			     relatedDocs.push(
				     new Document({
					     pageContent: res.response.Fields["text-string"][i],
					     metadata: {
						     type: res.response.Fields["type-string"][i],
						     box: { page: res.response.Fields["box_page-int"][i], 
							    left: res.response.Fields["box_left-float"][i], 
							    right: res.response.Fields["box_right-float"][i], 
							    top: res.response.Fields["box_top-float"][i], 
							    bottom: res.response.Fields["box_bottom-float"][i] },
					     }
				     }))
		     }
	     }
      }
  }
  return relatedDocs 
}

export async function isDocumentExist(key: string) {
  let res 
  const views = Zotero.PapersGPT.views as Views
  const url = `http://localhost:9080/isDocumentExist` 
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
              doc_id: key,
            }),
          }
        )
  } catch (error: any) {
	try {
          error = error.xmlhttp.response?.error
          views.setText(`# ${error.code}\n> ${url}\n\n**${error.type}**\n${error.message}`, true)
          new ztoolkit.ProgressWindow(error.code, { closeOtherProgressWindows: true })
            .createLine({ text: error.message, type: "default" })
            .show()
        } catch {
          new ztoolkit.ProgressWindow("Error", { closeOtherProgressWindows: true })
            .createLine({ text: error.message, type: "default" })
            .show()
        }
  }

  if (res?.response["Exist"]) {
        return res.response["Exist"]
  }
  return false
}

export async function addDoc(key: string, docs: Document[], type: string) {
  let res 
  const views = Zotero.PapersGPT.views as Views
  var textsArray: string[] = []
  var typesArray: string[] = []
  var idsArray: number[] = []
  var boxPageArray: number[] = []
  var boxLeftArray: number[] = []
  var boxRightArray: number[] = []
  var boxTopArray: number[] = []
  var boxBottomArray: number[] = [] 
  for (let i = 0; i < docs.length; i++) {
    textsArray.push(docs[i].pageContent)
    typesArray.push(type) 
    if (type == "box") {
	   boxPageArray.push(docs[i].metadata.box.page) 
	   boxLeftArray.push(docs[i].metadata.box.left) 
	   boxRightArray.push(docs[i].metadata.box.right) 
	   boxTopArray.push(docs[i].metadata.box.top) 
	   boxBottomArray.push(docs[i].metadata.box.bottom) 
    } else if (type == "id") {
	   idsArray.push(docs[i].metadata.id)
    } 
  }
  
  const url = `http://localhost:9080/add` 
  try {
	if (type == "id") {
		res = await Zotero.HTTP.request(
			"POST",
			url,
			{
				responseType: "json",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					doc_id: key,
					text$string: textsArray,
					type$string: typesArray,
					id$int: idsArray
				}),
			}
		)
	} else if (type == "box") {
	        res = await Zotero.HTTP.request(
			"POST",
			url,
			{
				responseType: "json",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					doc_id: key,
					text$string: textsArray,
					type$string: typesArray,
					box_page$int: boxPageArray,
					box_left$float: boxLeftArray,
					box_right$float: boxRightArray,
					box_top$float: boxTopArray,
					box_bottom$float: boxBottomArray
				}),
			}
		)
	}
  } catch (error: any) {
	try {
          error = error.xmlhttp.response?.error
          views.setText(`# ${error.code}\n> ${url}\n\n**${error.type}**\n${error.message}`, true)
          new ztoolkit.ProgressWindow(error.code, { closeOtherProgressWindows: true })
            .createLine({ text: error.message, type: "default" })
            .show()
        } catch {
          new ztoolkit.ProgressWindow("Error", { closeOtherProgressWindows: true })
            .createLine({ text: error.message, type: "default" })
            .show()
        }
  }

  if (res?.response?.Code) {
	if (res.response.Code == 200) {
		return true
	}
  }
  return false
}


export async function selectModel(publisher: string, model: string) {
  let res 
  const views = Zotero.PapersGPT.views as Views
  const url = `http://localhost:9080/selectModel` 
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
              publisher: publisher,
	      model: model 
            }),
          }
        )
  } catch (error: any) {
	try {
          error = error.xmlhttp.response?.error
          views.setText(`# ${error.code}\n> ${url}\n\n**${error.type}**\n${error.message}`, true)
          new ztoolkit.ProgressWindow(error.code, { closeOtherProgressWindows: true })
            .createLine({ text: error.message, type: "default" })
            .show()
        } catch {
          new ztoolkit.ProgressWindow("Error", { closeOtherProgressWindows: true })
            .createLine({ text: error.message, type: "default" })
            .show()
        }
  }

  if (res?.response["Code"]) {
        return res.response["Code"] == 200 ? true : false
  }
  return false
}


export async function getLocalModelDownloadProgress(model: string) {
  let res
   
  const views = Zotero.PapersGPT.views as Views
  const url = `http://localhost:9080/getLocalModelDownloadProgress` 
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
              publisher: "Local LLM",
	      model: model 
            }),
          }
        )
  } catch (error: any) {
	try {
          error = error.xmlhttp.response?.error
          views.setText(`# ${error.code}\n> ${url}\n\n**${error.type}**\n${error.message}`, true)
          new ztoolkit.ProgressWindow(error.code, { closeOtherProgressWindows: true })
            .createLine({ text: error.message, type: "default" })
            .show()
        } catch {
          new ztoolkit.ProgressWindow("Error", { closeOtherProgressWindows: true })
            .createLine({ text: error.message, type: "default" })
            .show()
        }
  }

  if (res?.response["Code"]) {
      if (res.response["Code"] == 203) {
	  var downloadingValue = res.response["DownloadingPercent"]
          return (downloadingValue > 100 || downloadingValue < 0 ) ? 0 : downloadingValue 
      } else if (res.response["Code"] == 200 
		 || res.response["Code"] == 201
		 || res.response["Code"] == 202) {
	  return res.response["Code"]
      } else {
        return -1 
      }
  }
  return -1
}	

export async function setApiKey(publisher: string, apiKey: string) {
  let res 
  const views = Zotero.PapersGPT.views as Views
  const url = `http://localhost:9080/setLLMApiKey` 
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
              publisher: publisher,
	      API_KEY: apiKey 
            }),
          }
        )
  } catch (error: any) {
	try {
          error = error.xmlhttp.response?.error
          views.setText(`# ${error.code}\n> ${url}\n\n**${error.type}**\n${error.message}`, true)
          new ztoolkit.ProgressWindow(error.code, { closeOtherProgressWindows: true })
            .createLine({ text: error.message, type: "default" })
            .show()
        } catch {
          new ztoolkit.ProgressWindow("Error", { closeOtherProgressWindows: true })
            .createLine({ text: error.message, type: "default" })
            .show()
        }
  }

  
  if (res?.response["Code"]) {
	  return res.response["Code"]
  }
  return -1
}

export async function getSupportedLLMs(publisher2models: Map<string, ModelConfig>, publishers:string[], email: string, token: string) {
  Zotero.log("Getting supported LLMs!")
  
  // 只设置许可状态，不添加默认模型
  Zotero.Prefs.set(`${config.addonRef}.isLicenseActivated`, true)
  
  // 获取现有的模型配置
  const customModels = JSON.parse(String(Zotero.Prefs.get(`${config.addonRef}.customModels`) || '[]'));
  
  // 解析现有的模型配置
  parseJsonResults(publisher2models, publishers, customModels)
}

function parseJsonResults(publisher2models: Map<string, ModelConfig>, publishers: string[], supportedLLMsJson: []) {
  // 只设置默认 API URL 和 Key，不添加默认模型
  const try_url = Zotero.Prefs.get(`${config.addonRef}.customModelApiUrl`)
  if (!try_url) {
    Zotero.log("Setting default API URL and Key")
    Zotero.Prefs.set(`${config.addonRef}.customModelApiUrl`, "https://api.openai.com/v1/chat/completions")
    Zotero.Prefs.set(`${config.addonRef}.customModelApiKey`, "")
  }

  // 获取当前设置
  const curAPIUrl = Zotero.Prefs.get(`${config.addonRef}.customModelApiUrl`)
  const curAPIKey = Zotero.Prefs.get(`${config.addonRef}.customModelApiKey`)
  const curModel = Zotero.Prefs.get(`${config.addonRef}.usingModel`)

  // 只在有当前模型时才设置
  if (curModel) {
    Zotero.Prefs.set(`${config.addonRef}.usingAPIKEY`, curAPIKey as string)
    Zotero.Prefs.set(`${config.addonRef}.usingAPIURL`, curAPIUrl as string)
    Zotero.Prefs.set(`${config.addonRef}.usingModel`, curModel as string)
  }
}

