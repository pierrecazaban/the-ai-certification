// Images des pages d'un fascicule (26/11), pour le lire dans le site sans quitter la page du module.
// Usage : swift scripts/fascicules-pages.swift <fichier.pdf> <dossier de sortie> <largeur en pixels>
// Écrit 1.jpg, 2.jpg… et affiche « pages largeur hauteur ». Moteur PDF du Mac (PDFKit), fond blanc, JPEG qualité 0,8.
import AppKit
import PDFKit

let args = CommandLine.arguments
guard args.count == 4, let width = Double(args[3]), let doc = PDFDocument(url: URL(fileURLWithPath: args[1])) else {
  FileHandle.standardError.write("usage : fascicules-pages.swift <pdf> <dossier> <largeur>\n".data(using: .utf8)!)
  exit(1)
}
try FileManager.default.createDirectory(atPath: args[2], withIntermediateDirectories: true)
var size = (0, 0)
for i in 0..<doc.pageCount {
  guard let page = doc.page(at: i) else { continue }
  let box = page.bounds(for: .mediaBox)
  let scale = CGFloat(width) / box.width
  let w = Int(width), h = Int((box.height * scale).rounded())
  guard let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0,
                            space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue) else { exit(2) }
  ctx.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 1))
  ctx.fill(CGRect(x: 0, y: 0, width: w, height: h))
  ctx.interpolationQuality = .high
  ctx.scaleBy(x: scale, y: scale)
  page.draw(with: .mediaBox, to: ctx)
  guard let image = ctx.makeImage(),
        let jpg = NSBitmapImageRep(cgImage: image).representation(using: .jpeg, properties: [.compressionFactor: 0.8]) else { exit(3) }
  try jpg.write(to: URL(fileURLWithPath: "\(args[2])/\(i + 1).jpg"))
  size = (w, h)
}
print("\(doc.pageCount) \(size.0) \(size.1)")
