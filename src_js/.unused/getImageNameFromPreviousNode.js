app.graphToPrompt().then(prompt => { p = prompt; console.log(prompt); })
_load_image_path_from_show_text = p.output[p.output[620].inputs.image[0]].inputs.text_0.replace(/.*output\//i, '')
_load_image_from_outputs = p.output[608].inputs.image.replace(' [output]', '')